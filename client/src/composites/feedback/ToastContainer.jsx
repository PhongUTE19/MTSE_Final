import React from 'react';
import Stack from '../../primitives/layout/Stack.jsx';
import ToastItem from './ToastItem.jsx';

export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-toast flex flex-col gap-2 max-w-toast w-[calc(100%-32px)] pointer-events-none"
      role="region"
      aria-label="Notifications"
    >
      <Stack gap="xs">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </Stack>
    </div>
  );
}
