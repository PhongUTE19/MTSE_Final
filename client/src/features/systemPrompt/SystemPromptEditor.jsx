import React, { useState } from 'react';
import { useSystemPrompt } from './useSystemPrompt';
import { useToast } from '../../app/providers/index.js';
import { UI_LABELS, VALIDATION_LIMITS } from '../../shared/constants';
import { validateSystemPrompt } from '../../shared/utils';
import Button from '../../primitives/buttons/Button.jsx';
import TextArea from '../../primitives/inputs/TextArea.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import Spinner from '../../primitives/feedback/Spinner.jsx';
import EmptyState from '../../composites/dataDisplay/EmptyState.jsx';
import ErrorText from '../../primitives/labels/ErrorText.jsx';
import Label from '../../primitives/labels/Label.jsx';
import Text from '../../primitives/typography/Text.jsx';

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
    <Stack gap="md">
      {loading ? (
        <EmptyState>
          <Spinner /> {UI_LABELS.SYSTEM_PROMPT_EDITOR.LOADING}
        </EmptyState>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <Stack gap="md">
            <Stack gap="xs">
              <Inline justify="between" align="center" fullWidth>
                <Label htmlFor="system-prompt-textarea">
                  {UI_LABELS.SYSTEM_PROMPT_EDITOR.ACTIVE_PROMPT_LABEL}
                </Label>
                <Text
                  as="span"
                  variant="mono"
                  color={charCount < minChars || charCount > maxChars ? 'danger' : 'muted'}
                >
                  {charCount} / {maxChars} characters (min {minChars})
                </Text>
              </Inline>
              <TextArea
                id="system-prompt-textarea"
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
                <ErrorText id="system-prompt-error">
                  {error}
                </ErrorText>
              )}
            </Stack>

            <Inline gap="sm" wrap>
              <Button
                type="submit"
                variant="primary"
                disabled={saving || !isDirty || !prompt.trim()}
                loading={saving}
              >
                {UI_LABELS.SYSTEM_PROMPT_EDITOR.SAVE_BTN}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleDiscard}
                disabled={saving || !isDirty}
              >
                {UI_LABELS.SYSTEM_PROMPT_EDITOR.DISCARD_BTN}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleResetToDefault}
                disabled={saving}
                title="Reset prompt back to system default configuration"
              >
                {UI_LABELS.SYSTEM_PROMPT_EDITOR.RESET_DEFAULT_BTN}
              </Button>
            </Inline>
          </Stack>
        </form>
      )}
    </Stack>
  );
}
