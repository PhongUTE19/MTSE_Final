import { useState, useCallback } from 'react';
import { fetchDocuments, fetchDocumentContent } from './documentApi';
import { APP_MESSAGES } from '../../shared/constants';

/**
 * Custom hook to manage read-only Knowledge Base document listing and inspection.
 *
 * @param {Object} options
 * @param {Function} [options.onError] - Callback to report error feedback
 * @param {Function} [options.clearFeedback] - Callback to clear existing feedback
 * @param {Function} [options.onOpenDocumentPanel] - Callback to open drawer when viewing a document
 */
export function useDocuments({
  onError,
  clearFeedback,
  onOpenDocumentPanel,
} = {}) {
  const [documents, setDocuments] = useState([]);
  const [viewingDoc, setViewingDoc] = useState(null);
  const [viewerLoading, setViewerLoading] = useState(false);

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

  const handleViewDocument = useCallback(async (filename) => {
    if (clearFeedback) clearFeedback();
    if (onOpenDocumentPanel) onOpenDocumentPanel();
    setViewerLoading(true);
    try {
      const doc = await fetchDocumentContent(filename);
      setViewingDoc({
        filename: doc.filename,
        content: doc.content,
      });
    } catch (err) {
      if (onError) {
        onError(err.message || APP_MESSAGES.ERROR.LOAD_DOC_CONTENT_FAILED);
      }
    } finally {
      setViewerLoading(false);
    }
  }, [clearFeedback, onOpenDocumentPanel, onError]);

  const closeView = useCallback(() => {
    setViewingDoc(null);
  }, []);

  return {
    documents,
    viewingDoc,
    viewerLoading,
    loadDocuments,
    handleViewDocument,
    closeView,
  };
}
