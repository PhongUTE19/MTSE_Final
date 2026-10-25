import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import ToastContainer from '../components/ToastContainer';
import { TOAST_TYPES, TOAST_DURATIONS } from '../constants';

const ToastContext = createContext(null);

let toastSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());
  const recentErrorsRef = useRef(new Map());
  const toastsRef = useRef([]);

  const dismissToast = useCallback((id) => {
    if (timersRef.current.has(id)) {
      clearTimeout(timersRef.current.get(id));
      timersRef.current.delete(id);
    }
    toastsRef.current = toastsRef.current.filter((t) => t.id !== id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = TOAST_TYPES.INFO, customDuration) => {
    if (!message) return null;

    const now = Date.now();
    if (type === TOAST_TYPES.ERROR) {
      const lastSeen = recentErrorsRef.current.get(message);
      if (lastSeen && now - lastSeen < 3000) {
        return null;
      }
      recentErrorsRef.current.set(message, now);
    }

    if (toastsRef.current.some((t) => t.message === message && t.type === type)) {
      return null;
    }

    const id = ++toastSeq;
    const duration = customDuration !== undefined
      ? customDuration
      : (TOAST_DURATIONS[type.toUpperCase()] ?? TOAST_DURATIONS.INFO);

    const newToast = { id, message, type, duration };
    toastsRef.current = [...toastsRef.current, newToast];
    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      const timer = setTimeout(() => {
        dismissToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [dismissToast]);

  const clearAllToasts = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    toastsRef.current = [];
    setToasts([]);
  }, []);

  // Cleanup active timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const toast = {
    success: (msg, dur) => showToast(msg, TOAST_TYPES.SUCCESS, dur),
    error: (msg, dur) => showToast(msg, TOAST_TYPES.ERROR, dur),
    info: (msg, dur) => showToast(msg, TOAST_TYPES.INFO, dur),
    warning: (msg, dur) => showToast(msg, TOAST_TYPES.WARNING, dur),
    dismiss: dismissToast,
    clearAll: clearAllToasts,
  };

  return (
    <ToastContext.Provider value={{ showToast, dismissToast, clearAllToasts, toast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
