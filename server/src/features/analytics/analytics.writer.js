import { getSupabaseClient, isSupabaseConfigured } from '../../shared/integrations/supabase.js';
import { defaultUsageStore } from './usageTracker.js';
import { formatRecordForDb } from './analytics.repository.js';
import { ANALYTICS_TABLE, WRITER_DEFAULTS } from './analytics.constants.js';

/**
 * Bounded Asynchronous Persistence Engine for Supabase.
 * Enqueues usage records in memory and flushes them in non-blocking batches.
 */
export class SupabaseUsageWriter {
  constructor(options = {}) {
    this.hasExplicitClient = 'client' in options;
    this.client = options.client || null;
    this.maxQueueSize = options.maxQueueSize || WRITER_DEFAULTS.MAX_QUEUE_SIZE;
    this.batchSize = options.batchSize || WRITER_DEFAULTS.BATCH_SIZE;
    this.flushIntervalMs = options.flushIntervalMs !== undefined
      ? options.flushIntervalMs
      : WRITER_DEFAULTS.FLUSH_INTERVAL_MS;
    this.maxRetries = options.maxRetries !== undefined
      ? options.maxRetries
      : WRITER_DEFAULTS.MAX_RETRIES;
    this.retryBaseDelayMs = options.retryBaseDelayMs || WRITER_DEFAULTS.RETRY_BASE_DELAY_MS;

    this.queue = [];
    this.timer = null;
    this.isFlushing = false;

    // Operational metrics
    this.stats = {
      totalEnqueued: 0,
      totalInserted: 0,
      failedInserts: 0,
      saturatedDrops: 0,
    };

    this.startFlushTimer();
  }

  get isConfigured() {
    if (process.env.FORCE_IN_MEMORY_ANALYTICS === 'true') {
      return Boolean(this.hasExplicitClient && this.client);
    }
    if (this.hasExplicitClient) {
      return Boolean(this.client);
    }
    return Boolean(this.client || isSupabaseConfigured());
  }

  get isDurable() {
    return this.isConfigured;
  }

  get queueLength() {
    return this.queue.length;
  }

  startFlushTimer() {
    if (!this.timer && this.flushIntervalMs > 0) {
      this.timer = setInterval(() => {
        this.flush().catch((err) => {
          console.error('[SupabaseWriter] Periodic flush error:', err.message);
        });
      }, this.flushIntervalMs);
      if (this.timer.unref) {
        this.timer.unref(); // Allow Node process to exit cleanly
      }
    }
  }

  stopFlushTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  destroy() {
    this.stopFlushTimer();
  }

  /**
   * Enqueues a usage record for asynchronous persistence.
   * Drops oldest item if queue is saturated to prevent unbounded memory growth.
   *
   * @param {object} record
   * @returns {boolean} True if enqueued, false if dropped due to saturation
   */
  enqueue(record) {
    if (!record || typeof record !== 'object') return false;

    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift(); // Evict oldest
      this.stats.saturatedDrops++;
      console.warn('[SupabaseWriter] Queue saturated. Dropped oldest record to preserve memory.');
    }

    this.queue.push(record);
    this.stats.totalEnqueued++;

    // Trigger immediate flush if batch size threshold is reached
    if (this.queue.length >= this.batchSize && !this.isFlushing) {
      this.flush().catch((err) => {
        console.error('[SupabaseWriter] Batch flush error:', err.message);
      });
    }

    return true;
  }

  /**
   * Flushes current queued records into Supabase in a batch.
   *
   * @returns {Promise<number>} Number of records inserted
   */
  async flush() {
    if (this.isFlushing || this.queue.length === 0) {
      return 0;
    }

    const client = this.client || getSupabaseClient();
    if (!client) {
      // Supabase is not configured; clear queue to prevent memory leak
      this.queue = [];
      return 0;
    }

    this.isFlushing = true;
    const batch = this.queue.splice(0, this.batchSize);
    const rows = batch.map(formatRecordForDb);

    let attempts = 0;
    let inserted = false;

    while (attempts <= this.maxRetries && !inserted) {
      attempts++;
      try {
        // Upsert with ignoreDuplicates to guarantee idempotency across retries
        const { error } = await client
          .from(ANALYTICS_TABLE)
          .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

        if (error) {
          throw new Error(error.message);
        }

        inserted = true;
        this.stats.totalInserted += rows.length;
      } catch (err) {
        if (attempts <= this.maxRetries) {
          const delay = this.retryBaseDelayMs * Math.pow(2, attempts - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          this.stats.failedInserts += rows.length;
          console.error(
            `[SupabaseWriter] Failed to insert ${rows.length} analytics records after ${attempts} attempts:`,
            err.message
          );
        }
      }
    }

    this.isFlushing = false;

    // Continue flushing if queue still has pending items
    if (this.queue.length >= this.batchSize) {
      return this.flush();
    }

    return inserted ? rows.length : 0;
  }
}

// Global default writer instance
export const defaultSupabaseWriter = new SupabaseUsageWriter();

// Automatically wire defaultUsageStore to defaultSupabaseWriter
defaultUsageStore.subscribe(async (record) => {
  if (process.env.FORCE_IN_MEMORY_ANALYTICS === 'true') {
    return;
  }
  if (isSupabaseConfigured()) {
    defaultSupabaseWriter.enqueue(record);
  }
});
