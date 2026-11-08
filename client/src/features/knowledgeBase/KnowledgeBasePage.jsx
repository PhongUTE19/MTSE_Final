import React, { useState, useCallback } from 'react';
import KnowledgeBaseSummary from './KnowledgeBaseSummary.jsx';
import DocumentEditor from '../document/DocumentEditor';
import DocumentTable from '../document/DocumentTable';
import ChunkReview from '../document/ChunkReview';
import SystemPromptEditor from '../systemPrompt/SystemPromptEditor';
import { PageHeader } from '../../layouts/WorkspaceLayout.jsx';
import { useWorkspace } from '../../app/providers/index.js';
import OverlayDrawer from '../../composites/overlays/OverlayDrawer.jsx';
import Button from '../../primitives/buttons/Button.jsx';
import Inline from '../../primitives/layout/Inline.jsx';
import Stack from '../../primitives/layout/Stack.jsx';
import { useDrawer } from '../../shared/hooks';
import { useKnowledgeBaseDashboard } from './useKnowledgeBaseDashboard';
import { UI_LABELS, ADMIN_PANELS } from '../../shared/constants';

/**
 * Admin Knowledge Base page: renders the management dashboard with document management,
 * chunk review, and system prompt configuration.
 */
export default function KnowledgeBasePage() {
  const { health, isOffline } = useWorkspace();

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Knowledge Base"
        description="Manage knowledge documents, inspect vector chunks, and configure the AI system prompt."
      />
      <KnowledgeBaseContent health={health} isOffline={isOffline} />
    </Stack>
  );
}

/**
 * Knowledge Base management content.
 * Coordinates document editing, chunk review, system prompt configuration,
 * and vector sync status cards.
 */
function KnowledgeBaseContent({
  health,
  isOffline: propIsOffline,
}) {
  const isOffline = propIsOffline ?? Boolean(health?.error);
  const [activePanel, setActivePanel] = useState(ADMIN_PANELS.DOCUMENTS);
  const drawer = useDrawer();

  const openDrawer = useCallback((panelName, event) => {
    if (panelName) {
      setActivePanel(panelName);
    }
    drawer.openDrawer(event);
  }, [drawer]);

  const {
    loading,
    chunksState,
    kb,
    docs,
  } = useKnowledgeBaseDashboard({
    isOffline,
    onOpenDocumentPanel: () => openDrawer(ADMIN_PANELS.DOCUMENTS),
  });

  const isPanelActive = (panel) => drawer.isDrawerOpen && activePanel === panel;

  const getDrawerTitle = () => {
    switch (activePanel) {
      case ADMIN_PANELS.CHUNKS:
        return UI_LABELS.CHUNK_REVIEW.TITLE;
      case ADMIN_PANELS.PROMPT:
        return UI_LABELS.SYSTEM_PROMPT_EDITOR.TITLE;
      case ADMIN_PANELS.DOCUMENTS:
      default:
        return UI_LABELS.DOCUMENT_TABLE.TITLE;
    }
  };

  return (
    <>
      {/* 1. Status Cards */}
      <KnowledgeBaseSummary status={kb.status} indexing={kb.indexing} loading={loading} />

      {/* 2. Management Navigation Bar */}
      <Inline gap="sm" wrap as="nav" aria-label="Admin panels">
        <Button
          type="button"
          variant={isPanelActive(ADMIN_PANELS.DOCUMENTS) ? 'primary' : 'secondary'}
          onClick={(e) => openDrawer(ADMIN_PANELS.DOCUMENTS, e)}
          aria-expanded={isPanelActive(ADMIN_PANELS.DOCUMENTS)}
          aria-controls="admin-drawer"
        >
          {UI_LABELS.ADMIN_DASHBOARD.NAV_DOCUMENTS}
        </Button>
        <Button
          type="button"
          variant={isPanelActive(ADMIN_PANELS.CHUNKS) ? 'primary' : 'secondary'}
          onClick={(e) => openDrawer(ADMIN_PANELS.CHUNKS, e)}
          aria-expanded={isPanelActive(ADMIN_PANELS.CHUNKS)}
          aria-controls="admin-drawer"
        >
          {UI_LABELS.ADMIN_DASHBOARD.NAV_CHUNKS}
        </Button>
        <Button
          type="button"
          variant={isPanelActive(ADMIN_PANELS.PROMPT) ? 'primary' : 'secondary'}
          onClick={(e) => openDrawer(ADMIN_PANELS.PROMPT, e)}
          aria-expanded={isPanelActive(ADMIN_PANELS.PROMPT)}
          aria-controls="admin-drawer"
        >
          {UI_LABELS.ADMIN_DASHBOARD.NAV_PROMPT}
        </Button>
      </Inline>

      {/* Slide-out Drawer */}
      <OverlayDrawer
        id="admin-drawer"
        isOpen={drawer.isDrawerOpen}
        onClose={drawer.closeDrawer}
        title={getDrawerTitle()}
        drawerRef={drawer.drawerRef}
        triggerRef={drawer.triggerRef}
      >
        {/* Documents Management & Inline Editor */}
        {activePanel === ADMIN_PANELS.DOCUMENTS && (
          <>
            <DocumentEditor
              editingDoc={docs.editingDoc}
              onChange={docs.setEditingDoc}
              onSave={docs.handleSaveDocument}
              onCancel={docs.cancelEdit}
              saving={docs.saving}
            />
            <DocumentTable
              documents={docs.documents}
              editorLoading={docs.editorLoading}
              onNew={docs.handleNewDocument}
              onEdit={docs.handleEditDocument}
              onDelete={docs.handleDeleteDocument}
              onUpload={docs.handleFileUpload}
              onReindex={kb.handleTriggerIndexing}
              indexing={kb.indexing}
              loading={loading}
              uploading={docs.uploading}
            />
          </>
        )}

        {/* Chunk Review Interface */}
        {activePanel === ADMIN_PANELS.CHUNKS && (
          <ChunkReview
            chunks={chunksState.chunks}
            totalChunks={chunksState.totalChunks}
            limit={chunksState.chunkLimit}
            offset={chunksState.chunkOffset}
            page={chunksState.page}
            totalPages={chunksState.totalPages}
            hasMore={chunksState.hasMore}
            searchQuery={chunksState.chunkSearch}
            loading={chunksState.chunksLoading}
            onSearchChange={chunksState.handleSearchChange}
            onLimitChange={chunksState.handleLimitChange}
            onPageChange={chunksState.handlePageChange}
            onPrevPage={chunksState.handlePrevPage}
            onNextPage={chunksState.handleNextPage}
          />
        )}

        {/* System Prompt Configuration */}
        {activePanel === ADMIN_PANELS.PROMPT && (
          <SystemPromptEditor isOffline={isOffline} />
        )}
      </OverlayDrawer>
    </>
  );
}
