import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook to manage slide-out drawer state, accessibility focus restoration,
 * keyboard Escape dismissal, and optional body scroll locking.
 *
 * @param {object} [options]
 * @param {boolean} [options.initialOpen=false] - Initial drawer open state
 * @param {boolean} [options.lockScroll=true] - Whether to lock document body scrolling while open
 * @returns {object} Drawer state, refs, and controllers
 */
export function useDrawer({ initialOpen = false, lockScroll = true } = {}) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  const drawerRef = useRef(null);
  const closeBtnRef = useRef(null);
  const triggerRef = useRef(null);

  const openDrawer = useCallback((event) => {
    if (event?.currentTarget) {
      triggerRef.current = event.currentTarget;
    }
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
      triggerRef.current.focus();
    }
  }, []);

  const toggleDrawer = useCallback((event) => {
    if (isOpen) {
      closeDrawer();
    } else {
      openDrawer(event);
    }
  }, [isOpen, closeDrawer, openDrawer]);

  // Keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeDrawer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeDrawer]);

  // Focus management when drawer is opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (closeBtnRef.current) {
          closeBtnRef.current.focus();
        } else if (drawerRef.current) {
          drawerRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Optional body scroll lock while drawer is open
  useEffect(() => {
    if (!isOpen || !lockScroll) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, lockScroll]);

  return {
    isOpen,
    setIsOpen,
    // Backward-compatibility aliases
    isDrawerOpen: isOpen,
    setIsDrawerOpen: setIsOpen,
    drawerRef,
    closeBtnRef,
    triggerRef,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  };
}
