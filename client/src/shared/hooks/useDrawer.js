import { useState, useRef, useCallback } from 'react';

/**
 * Custom hook holding slide-out drawer open state, refs, and controllers.
 *
 * It performs no DOM side effects of its own: Escape handling, focus trap,
 * initial focus, focus restoration and scroll locking are owned by the
 * <Drawer> component, so they run once whether or not this hook is used.
 *
 * @param {object} [options]
 * @param {boolean} [options.initialOpen=false] - Initial drawer open state
 * @returns {object} Drawer state, refs, and controllers
 */
export function useDrawer({ initialOpen = false } = {}) {
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
  }, []);

  const toggleDrawer = useCallback((event) => {
    if (isOpen) {
      closeDrawer();
    } else {
      openDrawer(event);
    }
  }, [isOpen, closeDrawer, openDrawer]);

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
