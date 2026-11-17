/**
 * Coordinated Express HTTP server graceful shutdown lifecycle.
 * Handles SIGTERM/SIGINT idempotently, drains active requests within a bounded
 * grace period, aborts/ends lingering SSE streams, and executes cleanup tasks safely.
 */

/**
 * @param {object} options
 * @param {import('http').Server} options.server
 * @param {number} [options.gracePeriodMs=10000]
 * @param {number} [options.forceExitTimeoutMs=5000]
 * @param {Array<{ name?: string, run: () => Promise<void> | void } | (() => Promise<void> | void)>} [options.cleanupTasks=[]]
 * @param {Pick<Console, 'log' | 'warn' | 'error'>} [options.logger=console]
 * @param {NodeJS.Process} [options.processRef=process]
 * @param {(code: number) => void} [options.onForceExit]
 */
export function createShutdownManager({
  server,
  gracePeriodMs = 10_000,
  forceExitTimeoutMs = 5_000,
  cleanupTasks = [],
  logger = console,
  processRef = process,
  onForceExit,
} = {}) {
  const activeSseConnections = new Set();
  let shutdownPromise = null;
  let signalsRegistered = false;
  let sigtermHandler = null;
  let sigintHandler = null;

  if (server && typeof server.on === 'function') {
    server.on('request', (_req, res) => {
      if (typeof res?.once === 'function') {
        res.once('finish', () => {
          if (shutdownPromise && typeof server.closeIdleConnections === 'function') {
            server.closeIdleConnections();
          }
        });
      }
    });
  }

  function trackSseConnection(res, abortController) {
    if (!res) return () => {};
    const entry = { res, abortController };
    activeSseConnections.add(entry);

    const untrack = () => {
      activeSseConnections.delete(entry);
    };
    if (typeof res.once === 'function') {
      res.once('close', untrack);
      res.once('finish', untrack);
    }
    return untrack;
  }

  function terminateActiveSseConnections() {
    for (const entry of Array.from(activeSseConnections)) {
      const { res, abortController } = entry;
      try {
        if (abortController && !abortController.signal?.aborted) {
          abortController.abort();
        }
        if (res && !res.writableEnded && typeof res.end === 'function') {
          res.end();
        }
      } catch {
        // Best-effort SSE termination during shutdown
      } finally {
        activeSseConnections.delete(entry);
      }
    }
  }

  async function runCleanupTasks() {
    const cleanupErrors = [];
    for (let i = 0; i < cleanupTasks.length; i++) {
      const task = cleanupTasks[i];
      const name = typeof task === 'object' && task?.name ? task.name : `task-${i + 1}`;
      const fn = typeof task === 'function' ? task : task?.run;
      if (typeof fn !== 'function') continue;

      try {
        await fn();
      } catch (err) {
        cleanupErrors.push({ name, error: err });
        logger.error(`[Server] Shutdown cleanup error (${name}): ${err?.message || err}`);
      }
    }
    return cleanupErrors;
  }

  function closeHttpServer() {
    if (!server || typeof server.close !== 'function') {
      return Promise.resolve({ timedOut: false, closeError: null });
    }

    return new Promise((resolve) => {
      let settled = false;
      let timedOut = false;

      const finish = (closeError = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(graceTimer);
        resolve({ timedOut, closeError });
      };

      const graceTimer = setTimeout(() => {
        timedOut = true;
        logger.warn(`[Server] Graceful shutdown period (${gracePeriodMs}ms) elapsed; terminating remaining connections.`);
        terminateActiveSseConnections();
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        // If the server had already stopped listening or close callback didn't fire synchronously
        if (!server.listening) {
          finish(null);
        }
      }, gracePeriodMs);
      graceTimer.unref?.();

      try {
        server.close((err) => {
          if (err && err.code === 'ERR_SERVER_NOT_RUNNING') {
            finish(null);
            return;
          }
          finish(err || null);
        });
        if (typeof server.closeIdleConnections === 'function') {
          server.closeIdleConnections();
        }
      } catch (err) {
        finish(err);
      }
    });
  }

  function shutdown(signal = 'SIGTERM') {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    logger.log(`[Server] Shutdown initiated (${signal}).`);

    shutdownPromise = (async () => {
      const forceDelay = Math.max(0, gracePeriodMs) + Math.max(0, forceExitTimeoutMs);
      let forceTimer = null;
      if (forceExitTimeoutMs > 0) {
        forceTimer = setTimeout(() => {
          logger.error(`[Server] Forced shutdown fallback triggered after ${forceDelay}ms.`);
          if (typeof onForceExit === 'function') {
            onForceExit(1);
          } else {
            processRef.exit(1);
          }
        }, forceDelay);
        forceTimer.unref?.();
      }

      try {
        const { timedOut, closeError } = await closeHttpServer();
        if (closeError) {
          logger.error(`[Server] HTTP server close error: ${closeError.message}`);
        }

        const cleanupErrors = await runCleanupTasks();
        if (closeError || cleanupErrors.length > 0) {
          processRef.exitCode = 1;
        }

        logger.log(`[Server] Shutdown complete (${signal}).`);
        return {
          signal,
          timedOut,
          closeError,
          cleanupErrors,
        };
      } finally {
        clearTimeout(forceTimer);
      }
    })();

    return shutdownPromise;
  }

  function registerSignalHandlers() {
    if (signalsRegistered) {
      return unregisterSignalHandlers;
    }
    signalsRegistered = true;

    sigtermHandler = () => {
      void shutdown('SIGTERM');
    };
    sigintHandler = () => {
      void shutdown('SIGINT');
    };

    processRef.on('SIGTERM', sigtermHandler);
    processRef.on('SIGINT', sigintHandler);

    return unregisterSignalHandlers;
  }

  function unregisterSignalHandlers() {
    if (!signalsRegistered) return;
    if (sigtermHandler) processRef.off('SIGTERM', sigtermHandler);
    if (sigintHandler) processRef.off('SIGINT', sigintHandler);
    sigtermHandler = null;
    sigintHandler = null;
    signalsRegistered = false;
  }

  return {
    shutdown,
    registerSignalHandlers,
    unregisterSignalHandlers,
    trackSseConnection,
    getActiveSseCount: () => activeSseConnections.size,
  };
}
