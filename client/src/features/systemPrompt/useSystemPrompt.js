import { useState, useEffect, useCallback } from 'react';
import { fetchSystemPrompt, updateSystemPrompt, resetSystemPrompt } from './systemPromptApi';
import { UI_LABELS, APP_MESSAGES } from '../../shared/constants';
import { useConfirm } from '../../shared/hooks';

/**
 * Custom hook to manage system prompt loading, updating, dirty checking, and resetting.
 *
 * @param {Object} [options]
 * @param {Function} [options.onError] - Callback to report error feedback
 * @param {Function} [options.onSuccess] - Callback to report success feedback
 */
export function useSystemPrompt({ onError, onSuccess, isOffline = false } = {}) {
  const { confirm } = useConfirm();
  const [prompt, setPrompt] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPrompt = useCallback(async () => {
    // Prevent repeated System Prompt API requests while offline
    if (isOffline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchSystemPrompt();
      setPrompt(data.prompt || '');
      setInitialPrompt(data.prompt || '');
    } catch (err) {
      if (onError) {
        onError(err.message || APP_MESSAGES.ERROR.LOAD_PROMPT_FAILED);
      }
    } finally {
      setLoading(false);
    }
  }, [isOffline, onError]);

  // Fetch when online, and automatically restore normal fetching when connectivity returns
  useEffect(() => {
    if (!isOffline) {
      loadPrompt();
    }
  }, [isOffline, loadPrompt]);

  const handleSave = useCallback(
    async (e) => {
      if (e?.preventDefault) e.preventDefault();
      if (!prompt.trim()) {
        if (onError) onError(APP_MESSAGES.ERROR.PROMPT_EMPTY);
        return;
      }

      setSaving(true);
      try {
        const result = await updateSystemPrompt(prompt);
        if (onSuccess) {
          onSuccess(result?.message || APP_MESSAGES.SUCCESS.PROMPT_UPDATED);
        }
        setInitialPrompt(result?.prompt || prompt);
      } catch (err) {
        if (onError) {
          onError(err.message || APP_MESSAGES.ERROR.UPDATE_PROMPT_FAILED);
        }
      } finally {
        setSaving(false);
      }
    },
    [prompt, onError, onSuccess]
  );

  const handleReset = useCallback(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  const handleResetToDefault = useCallback(async () => {
    const isConfirmed = await confirm({
      title: 'Reset System Prompt',
      message: UI_LABELS.SYSTEM_PROMPT_EDITOR.RESET_CONFIRMATION,
      confirmText: 'Reset to Default',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!isConfirmed) {
      return;
    }
    setSaving(true);
    try {
      const result = await resetSystemPrompt();
      setPrompt(result.prompt);
      setInitialPrompt(result.prompt);
      if (onSuccess) {
        onSuccess(result?.message || APP_MESSAGES.SUCCESS.PROMPT_RESET);
      }
    } catch (err) {
      if (onError) {
        onError(err.message || APP_MESSAGES.ERROR.UPDATE_PROMPT_FAILED);
      }
    } finally {
      setSaving(false);
    }
  }, [confirm, onError, onSuccess]);

  const isDirty = prompt !== initialPrompt;

  return {
    prompt,
    setPrompt,
    initialPrompt,
    loading,
    saving,
    isDirty,
    loadPrompt,
    handleSave,
    handleReset,
    handleResetToDefault,
  };
}
