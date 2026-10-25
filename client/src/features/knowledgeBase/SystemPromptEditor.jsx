import React, { useState } from 'react';
import { useSystemPrompt } from './useSystemPrompt';
import { useToast } from '../../shared/contexts/ToastContext';
import { UI_LABELS, VALIDATION_LIMITS } from '../../shared/constants';
import { validateSystemPrompt } from '../../shared/utils';

export default function SystemPromptEditor({ isOffline = false }) {
  const { toast } = useToast();
  const [error, setError] = useState(null);

  const {
    prompt,
    setPrompt,
    loading,
    saving,
    isDirty,
    handleSave,
    handleReset,
    handleResetToDefault,
  } = useSystemPrompt({
    onError: toast.error,
    onSuccess: toast.success,
    isOffline,
  });

  const onSubmit = (e) => {
    e.preventDefault();
    const val = validateSystemPrompt(prompt);
    if (!val.isValid) {
      setError(val.error);
      return;
    }
    setError(null);
    handleSave(e);
  };

  const handleChange = (e) => {
    setPrompt(e.target.value);
    if (error) {
      setError(null);
    }
  };

  const handleDiscard = () => {
    setError(null);
    handleReset();
  };

  const charCount = prompt ? prompt.trim().length : 0;
  const minChars = VALIDATION_LIMITS.SYSTEM_PROMPT.MIN_LENGTH;
  const maxChars = VALIDATION_LIMITS.SYSTEM_PROMPT.MAX_LENGTH;

  return (
    <div>
      {loading ? (
        <div className="empty-state">
          <span className="spinner"></span> {UI_LABELS.SYSTEM_PROMPT_EDITOR.LOADING}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <div className="form-group">
            <div className="split-layout form-group-header">
              <label htmlFor="system-prompt-textarea">
                {UI_LABELS.SYSTEM_PROMPT_EDITOR.ACTIVE_PROMPT_LABEL}
              </label>
              <span
                className={`char-count ${charCount < minChars || charCount > maxChars ? 'char-count--invalid' : ''}`}
              >
                {charCount} / {maxChars} characters (min {minChars})
              </span>
            </div>
            <textarea
              id="system-prompt-textarea"
              className="form-textarea"
              rows={10}
              value={prompt}
              onChange={handleChange}
              placeholder={UI_LABELS.SYSTEM_PROMPT_EDITOR.TEXTAREA_PLACEHOLDER}
              disabled={saving}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'system-prompt-error' : undefined}
              required
            />
            {error && (
              <div id="system-prompt-error" className="form-error" role="alert">
                {error}
              </div>
            )}
          </div>

          <div className="row-layout">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !isDirty || !prompt.trim()}
            >
              {saving ? (
                <>
                  <span className="spinner"></span> {UI_LABELS.SYSTEM_PROMPT_EDITOR.SAVING_BTN}
                </>
              ) : (
                UI_LABELS.SYSTEM_PROMPT_EDITOR.SAVE_BTN
              )}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDiscard}
              disabled={saving || !isDirty}
            >
              {UI_LABELS.SYSTEM_PROMPT_EDITOR.DISCARD_BTN}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleResetToDefault}
              disabled={saving}
              title="Reset prompt back to system default configuration"
            >
              {UI_LABELS.SYSTEM_PROMPT_EDITOR.RESET_DEFAULT_BTN}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
