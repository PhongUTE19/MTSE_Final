import { useState, useCallback } from 'react';
import {
  fetchDocuments,
  fetchDocumentContent,
  saveDocument,
  updateDocument,
  deleteDocument,
} from './documentsApi';
import { UI_LABELS, APP_MESSAGES } from '../../shared/constants';
import { validateDocumentFilename, validateDocumentContent, validateFile } from '../../shared/utils';
import { useConfirm } from '../../shared/hooks';

/**
 * Custom hook to manage document inventory, file uploads, and document create/edit/delete operations.
 *
 * @param {Object} options
 * @param {Function} [options.onRefresh] - Callback to refresh related data after a document mutation
 * @param {Function} [options.onError] - Callback to report error feedback
 * @param {Function} [options.onSuccess] - Callback to report success feedback
 * @param {Function} [options.clearFeedback] - Callback to clear existing feedback
 * @param {Function} [options.onOpenDocumentPanel] - Callback to open drawer when new/edit is triggered
 */
export function useDocuments({
  onRefresh,
  onError,
  onSuccess,
  clearFeedback,
  onOpenDocumentPanel,
} = {}) {
  const { confirm } = useConfirm();
  const [documents, setDocuments] = useState([]);
  const [editingDoc, setEditingDoc] = useState(null); // { filename, content, isNew }
  const [editorLoading, setEditorLoading] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const docsData = await fetchDocuments();
      const docs = docsData.documents || [];
      setDocuments(docs);
      return docs;
    } catch (err) {
      if (onError) {
        onError(err.message || APP_MESSAGES.ERROR.LOAD_OVERVIEW_FAILED);
      }
      throw err;
    }
  }, [onError]);

  // Open Document Editor for Create
  const handleNewDocument = useCallback(() => {
    if (onOpenDocumentPanel) onOpenDocumentPanel();
    setEditingDoc({
      filename: '',
      content: UI_LABELS.ADMIN_DASHBOARD.DEFAULT_DOC_CONTENT,
      isNew: true,
    });
    if (clearFeedback) clearFeedback();
  }, [onOpenDocumentPanel, clearFeedback]);

  // Open Document Editor for Edit
  const handleEditDocument = useCallback(async (filename) => {
    if (clearFeedback) clearFeedback();
    if (onOpenDocumentPanel) onOpenDocumentPanel();
    setEditorLoading(true);
    try {
      const doc = await fetchDocumentContent(filename);
      setEditingDoc({
        filename: doc.filename,
        content: doc.content,
        isNew: false,
      });
    } catch (err) {
      if (onError) {
        onError(err.message || APP_MESSAGES.ERROR.LOAD_DOC_CONTENT_FAILED);
      }
    } finally {
      setEditorLoading(false);
    }
  }, [clearFeedback, onOpenDocumentPanel, onError]);

  // Save Document (Create or Edit)
  const handleSaveDocument = useCallback(async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!editingDoc) return;

    if (clearFeedback) clearFeedback();

    const { filename, content, isNew } = editingDoc;

    if (isNew) {
      const filenameVal = validateDocumentFilename(filename);
      if (!filenameVal.isValid) {
        if (onError) onError(filenameVal.error);
        return;
      }
    }

    const contentVal = validateDocumentContent(content);
    if (!contentVal.isValid) {
      if (onError) onError(contentVal.error);
      return;
    }

    try {
      if (isNew) {
        await saveDocument(filename.trim(), content, false);
        if (onSuccess) onSuccess(APP_MESSAGES.SUCCESS.DOC_CREATED(filename));
      } else {
        await updateDocument(filename, content);
        if (onSuccess) onSuccess(APP_MESSAGES.SUCCESS.DOC_UPDATED(filename));
      }
      setEditingDoc(null);
      if (onRefresh) await onRefresh();
    } catch (err) {
      if (onError) {
        onError(err.message || APP_MESSAGES.ERROR.SAVE_DOC_FAILED);
      }
    }
  }, [editingDoc, clearFeedback, onError, onSuccess, onRefresh]);

  // Delete Document
  const handleDeleteDocument = useCallback(async (filename) => {
    const isConfirmed = await confirm({
      title: 'Delete Document',
      message: UI_LABELS.ADMIN_DASHBOARD.DELETE_CONFIRMATION(filename),
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!isConfirmed) {
      return;
    }

    if (clearFeedback) clearFeedback();
    try {
      await deleteDocument(filename);
      if (onSuccess) onSuccess(APP_MESSAGES.SUCCESS.DOC_DELETED(filename));
      if (onRefresh) await onRefresh();
    } catch (err) {
      if (onError) {
        onError(err.message || APP_MESSAGES.ERROR.DELETE_DOC_FAILED);
      }
    }
  }, [confirm, clearFeedback, onSuccess, onRefresh, onError]);

  // Upload File handler
  const handleFileUpload = useCallback(async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;

    if (clearFeedback) clearFeedback();

    const fileVal = validateFile(file);
    if (!fileVal.isValid) {
      if (onError) onError(fileVal.error);
      event.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const contentVal = validateDocumentContent(text);
      if (!contentVal.isValid) {
        if (onError) onError(contentVal.error);
        event.target.value = '';
        return;
      }

      await saveDocument(file.name, text, true);
      if (onSuccess) onSuccess(APP_MESSAGES.SUCCESS.FILE_UPLOADED(file.name));
      if (onRefresh) await onRefresh();
    } catch (err) {
      if (onError) {
        onError(err.message || APP_MESSAGES.ERROR.UPLOAD_DOC_FAILED);
      }
    } finally {
      if (event.target) event.target.value = '';
    }
  }, [clearFeedback, onError, onSuccess, onRefresh]);

  const cancelEdit = useCallback(() => {
    setEditingDoc(null);
  }, []);

  return {
    documents,
    setDocuments,
    editingDoc,
    setEditingDoc,
    editorLoading,
    loadDocuments,
    handleNewDocument,
    handleEditDocument,
    handleSaveDocument,
    handleDeleteDocument,
    handleFileUpload,
    cancelEdit,
  };
}
