import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Button from '../../primitives/buttons/Button.jsx';

const VIEWPORT_MARGIN_PX = 8;

/**
 * Reusable accessible context menu composite.
 * Manages viewport clamping, outside-click dismissal, Escape dismissal,
 * and Arrow-key keyboard navigation.
 */
export default function ContextMenu({
  isOpen = false,
  position = null,
  items = [],
  onClose,
  ariaLabel = 'Context menu',
}) {
  const menuRef = useRef(null);
  const [coords, setCoords] = useState(() => position || { x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!isOpen || !position) return;
    let nextX = position.x;
    let nextY = position.y;
    const el = menuRef.current;
    if (el && typeof window !== 'undefined') {
      const rect = el.getBoundingClientRect();
      const maxX = Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - rect.width - VIEWPORT_MARGIN_PX);
      const maxY = Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - rect.height - VIEWPORT_MARGIN_PX);
      nextX = Math.min(Math.max(VIEWPORT_MARGIN_PX, position.x), maxX);
      nextY = Math.min(Math.max(VIEWPORT_MARGIN_PX, position.y), maxY);
    }
    setCoords({ x: nextX, y: nextY });
  }, [isOpen, position]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const firstButton = menuRef.current?.querySelector('button:not(:disabled)');
    firstButton?.focus();

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose?.();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const buttons = Array.from(
          menuRef.current?.querySelectorAll('button:not(:disabled)') || []
        );
        if (buttons.length === 0) return;
        event.preventDefault();
        const currentIndex = buttons.indexOf(document.activeElement);
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex =
          currentIndex === -1
            ? 0
            : (currentIndex + delta + buttons.length) % buttons.length;
        buttons[nextIndex]?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !position || items.length === 0) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      style={{ top: `${coords.y}px`, left: `${coords.x}px` }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="fixed z-modal min-w-[160px] rounded-lg border border-border bg-surface p-1.5 shadow-modal flex flex-col gap-1"
    >
      {items.map((item) => (
        <Button
          key={item.id || item.label}
          type="button"
          role="menuitem"
          variant={item.variant === 'danger' ? 'danger' : 'ghost'}
          size="sm"
          fullWidth
          icon={item.icon}
          disabled={Boolean(item.disabled)}
          onClick={(e) => {
            e.stopPropagation();
            if (item.disabled) return;
            item.onSelect?.();
            onClose?.();
          }}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
