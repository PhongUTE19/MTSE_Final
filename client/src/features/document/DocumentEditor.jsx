import React, { useState } from 'react';
import { UI_LABELS } from '../../shared/constants';
import { validateDocumentFilename, validateDocumentContent } from '../../shared/utils';
import Button from '../../primitives/buttons/Button.jsx';
import TextInput from '../../primitives/inputs/TextInput.jsx';
import TextArea from '../../primitives/inputs/TextArea.jsx';
import { Inline, Stack } from '../../primitives/layout/index.js';
import FormField from '../../composites/forms/FormField.jsx';
import { Card, CardHeader, CardTitle, CardContent } from '../../primitives/cards/index.js';

export default function DocumentEditor({ editingDoc, onChange, onSave, onCancel, saving = false }) {
  const [errors, setErrors] = useState({ filename: null, content: null });

  if (!editingDoc) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (saving) return;

    const newErrors = {};
    if (editingDoc.isNew) {
      const filenameVal = validateDocumentFilename(editingDoc.filename);
      if (!filenameVal.isValid) {
        newErrors.filename = filenameVal.error;
      }
    }

    const contentVal = validateDocumentContent(editingDoc.content);
    if (!contentVal.isValid) {
      newErrors.content = contentVal.error;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({ filename: null, content: null });
    onSave(e);
  };

  const handleFilenameChange = (e) => {
    if (errors.filename) {
      setErrors((prev) => ({ ...prev, filename: null }));
    }
    onChange({ ...editingDoc, filename: e.target.value });
  };

  const handleContentChange = (e) => {
    if (errors.content) {
      setErrors((prev) => ({ ...prev, content: null }));
    }
    onChange({ ...editingDoc, content: e.target.value });
  };

  return (
    <Card variant="outlined" padding="lg">
      <CardHeader>
        <Inline justify="between" align="center" fullWidth>
          <CardTitle as="h3">
            {editingDoc.isNew
              ? UI_LABELS.DOCUMENT_EDITOR.ADD_NEW_DOC
              : `${UI_LABELS.DOCUMENT_EDITOR.EDIT_DOC_PREFIX}${editingDoc.filename}`}
          </CardTitle>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            {UI_LABELS.COMMON.CANCEL}
          </Button>
        </Inline>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate>
          <Stack gap="md">
            <FormField
              id="document-filename-input"
              label={UI_LABELS.DOCUMENT_EDITOR.FILENAME_LABEL}
              error={errors.filename}
              required
            >
              <TextInput
                id="document-filename-input"
                type="text"
                value={editingDoc.filename}
                disabled={saving || !editingDoc.isNew}
                placeholder={UI_LABELS.DOCUMENT_EDITOR.FILENAME_PLACEHOLDER}
                onChange={handleFilenameChange}
                aria-invalid={Boolean(errors.filename)}
                aria-describedby={errors.filename ? 'document-filename-input-error' : undefined}
                required
              />
            </FormField>
            <FormField
              id="document-content-textarea"
              label={UI_LABELS.DOCUMENT_EDITOR.CONTENT_LABEL}
              error={errors.content}
              required
            >
              <TextArea
                id="document-content-textarea"
                rows={12}
                value={editingDoc.content}
                onChange={handleContentChange}
                disabled={saving}
                placeholder={UI_LABELS.DOCUMENT_EDITOR.CONTENT_PLACEHOLDER}
                aria-invalid={Boolean(errors.content)}
                aria-describedby={errors.content ? 'document-content-textarea-error' : undefined}
                required
              />
            </FormField>
            <Inline gap="sm">
              <Button type="submit" variant="primary" disabled={saving} loading={saving}>
                {UI_LABELS.DOCUMENT_EDITOR.SAVE_BTN}
              </Button>
              <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
                {UI_LABELS.COMMON.CANCEL}
              </Button>
            </Inline>
          </Stack>
        </form>
      </CardContent>
    </Card>
  );
}
