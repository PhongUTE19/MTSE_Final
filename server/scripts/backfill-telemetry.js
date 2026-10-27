/**
 * Safe, repeatable telemetry repair, deterministic token estimation, and backfill script.
 *
 * Usage:
 *   node server/scripts/backfill-telemetry.js --dry-run
 *   node server/scripts/backfill-telemetry.js --apply
 */

import { getSupabaseClient } from '../src/shared/integrations/supabase.js';
import { MODEL_PRICING_REGISTRY, normalizeModelName } from '../src/features/analytics/pricingConfig.js';
import { estimateTokensForRequest, calculateEstimatedBackfillCost } from '../src/features/analytics/tokenEstimator.js';

const isDryRun = !process.argv.includes('--apply');

async function main() {
  console.log(`=== AI TELEMETRY BACKFILL & ESTIMATION (${isDryRun ? 'DRY RUN' : 'APPLY MODE'}) ===`);

  const client = getSupabaseClient();
  if (!client) {
    console.error('Database client not available.');
    process.exit(1);
  }

  const { data: rows, error } = await client.from('ai_usage_analytics').select('*');
  if (error) {
    console.error('Error fetching records:', error.message);
    process.exit(1);
  }

  console.log(`Fetched ${rows.length} total historical records.`);

  const stats = {
    totalRecords: rows.length,
    actualTokensPreserved: 0,
    estimatedTokensGenerated: 0,
    alreadyCalculatedCost: 0,
    recalculatedActualCost: 0,
    estimatedBackfillCost: 0,
    unpricedUnknownModel: 0,
    pureHashMovedToPromptHash: 0,
    compositeSplit: 0,
    preservedExplicitVersion: 0,
    unknownVersionRemaining: 0,
  };

  const updates = [];

  for (const row of rows) {
    let changed = false;
    const patch = { id: row.id };

    // 1. Prompt Identity & Version Repair
    const promptVersion = row.prompt_version;
    const promptHash = row.prompt_hash;
    const promptId = row.prompt_id;

    if (promptVersion && typeof promptVersion === 'string') {
      const trimmed = promptVersion.trim();
      if (/^[a-f0-9]{64}$/i.test(trimmed)) {
        patch.prompt_hash = promptHash || trimmed;
        patch.prompt_version = null;
        changed = true;
        stats.pureHashMovedToPromptHash++;
        stats.unknownVersionRemaining++;
      } else if (/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+:[a-f0-9]{64}$/i.test(trimmed)) {
        const parts = trimmed.split(':');
        patch.prompt_id = promptId || parts[0];
        patch.prompt_version = parts[1];
        patch.prompt_hash = promptHash || parts[2];
        changed = true;
        stats.compositeSplit++;
        stats.preservedExplicitVersion++;
      } else if (/^[a-zA-Z0-9_-]+:[a-f0-9]{64}$/i.test(trimmed)) {
        const parts = trimmed.split(':');
        patch.prompt_version = parts[0];
        patch.prompt_hash = promptHash || parts[1];
        changed = true;
        stats.compositeSplit++;
        stats.preservedExplicitVersion++;
      } else {
        stats.preservedExplicitVersion++;
      }
    } else {
      stats.unknownVersionRemaining++;
    }

    // 2. Token Derivation & Deterministic Estimation
    const hasInput = typeof row.input_tokens === 'number';
    const hasOutput = typeof row.output_tokens === 'number';
    const hasTotal = typeof row.total_tokens === 'number';

    let effectiveTokens;

    if (hasInput && hasOutput) {
      stats.actualTokensPreserved++;
      // If total is missing, derive it
      if (!hasTotal) {
        patch.total_tokens = row.input_tokens + row.output_tokens;
        patch.token_counts_available = true;
        changed = true;
      }
      effectiveTokens = {
        effectiveInputTokens: row.input_tokens,
        effectiveOutputTokens: row.output_tokens,
        effectiveTotalTokens: row.total_tokens ?? (row.input_tokens + row.output_tokens),
        isEstimated: false,
      };
    } else {
      // Missing token usage: derive deterministic estimate from request context
      const estimate = estimateTokensForRequest(row);
      stats.estimatedTokensGenerated++;

      patch.estimated_input_tokens = estimate.estimatedInputTokens;
      patch.estimated_output_tokens = estimate.estimatedOutputTokens;
      patch.estimated_total_tokens = estimate.estimatedTotalTokens;

      // Also attach to attempts[0] metadata for resilience across database schema versions
      const currentAttempts = Array.isArray(row.attempts) && row.attempts.length > 0
        ? [...row.attempts]
        : [{ attemptNumber: 1, durationMs: row.duration_ms || 0, status: row.outcome === 'failure' ? 'failure' : 'success' }];

      currentAttempts[0] = {
        ...currentAttempts[0],
        estimatedTokens: {
          inputTokens: estimate.estimatedInputTokens,
          outputTokens: estimate.estimatedOutputTokens,
          totalTokens: estimate.estimatedTotalTokens,
          effectiveInputTokens: estimate.effectiveInputTokens,
          effectiveOutputTokens: estimate.effectiveOutputTokens,
          effectiveTotalTokens: estimate.effectiveTotalTokens,
          isEstimated: true,
        },
      };
      patch.attempts = currentAttempts;
      changed = true;

      effectiveTokens = estimate;
    }

    // 3. Cost & Pricing Calculation
    const normalizedModel = normalizeModelName(row.model);
    const pricing = MODEL_PRICING_REGISTRY[normalizedModel];
    const rowTimestamp = new Date(row.timestamp);

    if (row.estimated_cost != null && (row.cost_status === 'calculated' || row.cost_status === 'estimated_backfill')) {
      if (row.cost_status === 'calculated') {
        stats.alreadyCalculatedCost++;
      } else {
        stats.estimatedBackfillCost++;
      }
    } else {
      // Need cost calculation or status update
      if (!pricing) {
        if (row.cost_status !== 'unknown_pricing') {
          patch.cost_status = 'unknown_pricing';
          changed = true;
        }
        stats.unpricedUnknownModel++;
      } else {
        const effectiveDate = new Date(pricing.effectiveDate);
        if (rowTimestamp >= effectiveDate) {
          const inCost = (effectiveTokens.effectiveInputTokens / 1_000_000) * pricing.inputCostPerMillion;
          const outCost = (effectiveTokens.effectiveOutputTokens / 1_000_000) * pricing.outputCostPerMillion;
          const calculatedCost = Number((inCost + outCost).toFixed(8));

          patch.estimated_cost = calculatedCost;
          if (effectiveTokens.isEstimated) {
            patch.cost_status = 'estimated_backfill';
            stats.estimatedBackfillCost++;
          } else {
            patch.cost_status = 'calculated';
            stats.recalculatedActualCost++;
          }
          changed = true;
        } else {
          if (row.cost_status !== 'unknown_pricing') {
            patch.cost_status = 'unknown_pricing';
            changed = true;
          }
          stats.unpricedUnknownModel++;
        }
      }
    }

    if (changed) {
      updates.push(patch);
    }
  }

  console.log('\n--- Proposed / Applied Changes Assessment ---');
  console.log(`Total records evaluated: ${stats.totalRecords}`);
  console.log(`Records requiring updates: ${updates.length}`);
  console.log(`- Actual provider token records preserved: ${stats.actualTokensPreserved}`);
  console.log(`- Deterministic estimated tokens generated: ${stats.estimatedTokensGenerated}`);
  console.log(`- Verified actual costs preserved: ${stats.alreadyCalculatedCost}`);
  console.log(`- Verified actual costs recalculated: ${stats.recalculatedActualCost}`);
  console.log(`- Estimated backfill costs calculated: ${stats.estimatedBackfillCost}`);
  console.log(`- Records with unknown model pricing: ${stats.unpricedUnknownModel}`);

  if (isDryRun) {
    console.log('\n[DRY RUN COMPLETE] No records were modified in the database.');
    console.log('Run with --apply to execute the updates.');
    return;
  }

  console.log(`\nApplying updates to ${updates.length} records...`);
  let successCount = 0;

  for (const patch of updates) {
    const { id, ...data } = patch;
    let { error: updateError } = await client
      .from('ai_usage_analytics')
      .update(data)
      .eq('id', id);

    if (updateError && updateError.message && updateError.message.includes('estimated_input_tokens')) {
      // Dedicated columns not yet in DB schema; fall back to updating cost, status, and attempts metadata
      const { estimated_input_tokens, estimated_output_tokens, estimated_total_tokens, ...fallbackData } = data;
      const fallbackResult = await client
        .from('ai_usage_analytics')
        .update(fallbackData)
        .eq('id', id);
      updateError = fallbackResult.error;
    }

    if (updateError) {
      console.error(`Failed to update record ${id}:`, updateError.message);
    } else {
      successCount++;
    }
  }

  console.log(`[APPLY COMPLETE] Successfully updated ${successCount} of ${updates.length} records.`);
}

main().catch(console.error);
