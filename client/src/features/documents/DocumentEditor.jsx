import React, { useState } from 'react';
import { UI_LABELS } from '../../shared/constants';
import { validateDocumentFilename, validateDocumentContent } from '../../shared/utils';

export default function DocumentEditor({ editingDoc, onChange, onSave, onCancel }) {
  const [errors, setErrors] = useState({ filename: null, content: null });

  if (!editingDoc) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

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
    <div className="panel">
      <div className="panel-header split-layout">
        <h3 className="panel-title">
          {editingDoc.isNew
            ? UI_LABELS.DOCUMENT_EDITOR.ADD_NEW_DOC
            : `${UI_LABELS.DOCUMENT_EDITOR.EDIT_DOC_PREFIX}${editingDoc.filename}`}
        </h3>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          {UI_LABELS.COMMON.CANCEL}
        </button>
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor="document-filename-input">
            {UI_LABELS.DOCUMENT_EDITOR.FILENAME_LABEL}
          </label>
          <input
            id="document-filename-input"
            type="text"
            className="form-input"
            value={editingDoc.filename}
            disabled={!editingDoc.isNew}
            placeholder={UI_LABELS.DOCUMENT_EDITOR.FILENAME_PLACEHOLDER}
            onChange={handleFilenameChange}
            aria-invalid={Boolean(errors.filename)}
            aria-describedby={errors.filename ? 'document-filename-error' : undefined}
            required
          />
          {errors.filename && (
            <div id="document-filename-error" className="form-error" role="alert">
              {errors.filename}
            </div>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="document-content-textarea">
            {UI_LABELS.DOCUMENT_EDITOR.CONTENT_LABEL}
          </label>
          <textarea
            id="document-content-textarea"
            className="form-textarea"
            rows={12}
            value={editingDoc.content}
            onChange={handleContentChange}
            placeholder={UI_LABELS.DOCUMENT_EDITOR.CONTENT_PLACEHOLDER}
            aria-invalid={Boolean(errors.content)}
            aria-describedby={errors.content ? 'document-content-error' : undefined}
            required
          />
          {errors.content && (
            <div id="document-content-error" className="form-error" role="alert">
              {errors.content}
            </div>
          )}
        </div>
        <div className="row-layout">
          <button type="submit" className="btn btn-primary">
            {UI_LABELS.DOCUMENT_EDITOR.SAVE_BTN}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {UI_LABELS.COMMON.CANCEL}
          </button>
        </div>
      </form>
    </div>
  );
}
