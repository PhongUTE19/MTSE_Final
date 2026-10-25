import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { fallbackConfirm, normalizeConfirmOptions } from '../utils/confirmUtils';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    options: normalizeConfirmOptions(''),
    isLoading: false,
  });

  const resolverRef = useRef(null);

  const confirm = useCallback((options) => {
    const normalized = normalizeConfirmOptions(options);

    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialogState({
        isOpen: true,
        options: normalized,
        isLoading: false,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
    setDialogState((prev) => ({ ...prev, isOpen: false, isLoading: false }));
  }, []);

  const handleCancel = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setDialogState((prev) => ({ ...prev, isOpen: false, isLoading: false }));
  }, []);

  const setConfirmLoading = useCallback((loading) => {
    setDialogState((prev) => ({ ...prev, isLoading: Boolean(loading) }));
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm, setConfirmLoading }}>
      {children}
      <ConfirmDialog
        isOpen={dialogState.isOpen}
        title={dialogState.options.title}
        message={dialogState.options.message}
        confirmText={dialogState.options.confirmText}
        cancelText={dialogState.options.cancelText}
        variant={dialogState.options.variant}
        isLoading={dialogState.isLoading}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    return {
      confirm: fallbackConfirm,
      setConfirmLoading: () => {},
    };
  }
  return context;
}
