import { useState, useEffect, useRef, useCallback } from 'react';
import { UI_LABELS, ADMIN_PANELS } from '../../shared/constants';

/**
 * Custom hook to manage slide-out drawer state, accessibility focus,
 * keyboard Escape dismissal, body scroll locking, and drawer header titles.
 */
export function useDrawer(initialPanel = ADMIN_PANELS.DOCUMENTS) {
  const [activePanel, setActivePanel] = useState(initialPanel);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const drawerRef = useRef(null);
  const closeBtnRef = useRef(null);
  const triggerRef = useRef(null);

  const openDrawer = useCallback((panelName, event) => {
    if (event?.currentTarget) {
      triggerRef.current = event.currentTarget;
    }
    if (panelName) {
      setActivePanel(panelName);
    }
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
      triggerRef.current.focus();
    }
  }, []);

  // Keyboard Escape listener
  useEffect(() => {
    if (!isDrawerOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeDrawer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, closeDrawer]);

  // Focus drawer when opened
  useEffect(() => {
    if (isDrawerOpen) {
      const timer = setTimeout(() => {
        if (closeBtnRef.current) {
          closeBtnRef.current.focus();
        } else if (drawerRef.current) {
          drawerRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isDrawerOpen]);

  // Body scroll lock while drawer is open
  useEffect(() => {
    if (!isDrawerOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isDrawerOpen]);

  const getDrawerTitle = useCallback(() => {
    switch (activePanel) {
      case ADMIN_PANELS.CHUNKS:
        return UI_LABELS.CHUNK_REVIEW.TITLE;
      case ADMIN_PANELS.PROMPT:
        return UI_LABELS.SYSTEM_PROMPT_EDITOR.TITLE;
      case ADMIN_PANELS.DOCUMENTS:
      default:
        return UI_LABELS.DOCUMENT_TABLE.TITLE;
    }
  }, [activePanel]);

  return {
    activePanel,
    setActivePanel,
    isDrawerOpen,
    drawerRef,
    closeBtnRef,
    triggerRef,
    openDrawer,
    closeDrawer,
    getDrawerTitle,
  };
}
