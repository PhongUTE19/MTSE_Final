import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from '../../composites/overlays/ConfirmDialog.jsx';
import { fallbackConfirm, normalizeConfirmOptions } from '../../shared/utils/confirmUtils.js';

const ConfirmContext = createContext(null);

/**
 * Provides a promise-based `confirm()` backed by a single dialog.
 *
 * Contract: at most one confirmation is pending. Every returned promise settles
 * exactly once — `true` on confirm, `false` on cancel, when superseded by a newer
 * request, or when the provider unmounts.
 */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  // Settle the pending promise (if any) and clear the ref so it cannot settle twice.
  const settle = useCallback((result) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  }, []);

  const confirm = useCallback((options) => {
    const normalized = normalizeConfirmOptions(options);

    return new Promise((resolve) => {
      settle(false);
      resolverRef.current = resolve;
      setDialog(normalized);
    });
  }, [settle]);

  const handleResult = useCallback((result) => {
    settle(result);
    setDialog(null);
  }, [settle]);

  const handleConfirm = useCallback(() => handleResult(true), [handleResult]);
  const handleCancel = useCallback(() => handleResult(false), [handleResult]);

  useEffect(() => () => settle(false), [settle]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        isOpen={Boolean(dialog)}
        title={dialog?.title}
        message={dialog?.message}
        confirmText={dialog?.confirmText}
        cancelText={dialog?.cancelText}
        variant={dialog?.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}

const FALLBACK_CONTEXT = Object.freeze({ confirm: fallbackConfirm });

export function useConfirm() {
  return useContext(ConfirmContext) ?? FALLBACK_CONTEXT;
}
