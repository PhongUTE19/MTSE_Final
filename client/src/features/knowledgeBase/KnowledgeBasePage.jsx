import React, { useState, useCallback } from 'react';
import KnowledgeBaseStats from './KnowledgeBaseStats';
import DocumentEditor from '../documents/DocumentEditor';
import DocumentTable from '../documents/DocumentTable';
import ChunkReview from '../documents/ChunkReview';
import SystemPromptEditor from '../systemPrompt/SystemPromptEditor';
import WorkspaceLayout from '../../layouts/WorkspaceLayout';
import HealthBadge from '../../shared/components/HealthBadge';
import Drawer from '../../shared/components/Drawer';
import { ToastProvider } from '../../shared/contexts/ToastContext';
import { useHealth, useDrawer } from '../../shared/hooks';
import { useKnowledgeBaseDashboard } from './useKnowledgeBaseDashboard';
import { UI_LABELS, ADMIN_PANELS, ADMIN_TABS, USER_ROLES } from '../../shared/constants';
import './knowledgeBase.css';

/**
 * Admin Knowledge Base page: renders the management dashboard inside the shared
 * workspace layout, with the health badge and toast context it depends on.
 */
export default function KnowledgeBasePage({ user, onSignOut }) {
  const { health, checkHealth } = useHealth(USER_ROLES.ADMIN);

  return (
    <ToastProvider>
      <WorkspaceLayout
        eyebrow="ADMINISTRATION"
        title="Knowledge Base"
        sidebarProps={{ activeView: ADMIN_TABS.KNOWLEDGE, user, onSignOut }}
        headerAction={
          <HealthBadge
            status={health?.status}
            indexedChunks={health?.indexedChunks}
            loading={health?.loading}
            error={health?.error}
            onRetry={checkHealth}
          />
        }
      >
        <div className="dashboard-container">
          <KnowledgeBaseContent health={health} onRefreshHealth={checkHealth} />
        </div>
      </WorkspaceLayout>
    </ToastProvider>
  );
}

/**
 * Knowledge Base management content.
 * Coordinates document editing, chunk review, system prompt configuration,
 * and vector sync status cards.
 */
function KnowledgeBaseContent({
  health,
  onRefreshHealth,
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
      <KnowledgeBaseStats status={kb.status} indexing={kb.indexing} />

      {/* 2. Management Navigation Bar */}
      <div className="dashboard-content-layout">
        <nav className="dashboard-nav" aria-label="Admin panels">
          <button
            type="button"
            className={`btn ${isPanelActive(ADMIN_PANELS.DOCUMENTS) ? 'btn-primary' : 'btn-secondary'}`}
            onClick={(e) => openDrawer(ADMIN_PANELS.DOCUMENTS, e)}
            aria-expanded={isPanelActive(ADMIN_PANELS.DOCUMENTS)}
            aria-controls="admin-drawer"
          >
            {UI_LABELS.ADMIN_DASHBOARD.NAV_DOCUMENTS}
          </button>
          <button
            type="button"
            className={`btn ${isPanelActive(ADMIN_PANELS.CHUNKS) ? 'btn-primary' : 'btn-secondary'}`}
            onClick={(e) => openDrawer(ADMIN_PANELS.CHUNKS, e)}
            aria-expanded={isPanelActive(ADMIN_PANELS.CHUNKS)}
            aria-controls="admin-drawer"
          >
            {UI_LABELS.ADMIN_DASHBOARD.NAV_CHUNKS}
          </button>
          <button
            type="button"
            className={`btn ${isPanelActive(ADMIN_PANELS.PROMPT) ? 'btn-primary' : 'btn-secondary'}`}
            onClick={(e) => openDrawer(ADMIN_PANELS.PROMPT, e)}
            aria-expanded={isPanelActive(ADMIN_PANELS.PROMPT)}
            aria-controls="admin-drawer"
          >
            {UI_LABELS.ADMIN_DASHBOARD.NAV_PROMPT}
          </button>
        </nav>
      </div>

      {/* Slide-out Drawer */}
      <Drawer
        id="admin-drawer"
        isOpen={drawer.isDrawerOpen}
        onClose={drawer.closeDrawer}
        title={getDrawerTitle()}
        drawerRef={drawer.drawerRef}
      >
        {/* Documents Management & Inline Editor */}
        {activePanel === ADMIN_PANELS.DOCUMENTS && (
          <>
            <DocumentEditor
              editingDoc={docs.editingDoc}
              onChange={docs.setEditingDoc}
              onSave={docs.handleSaveDocument}
              onCancel={docs.cancelEdit}
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
      </Drawer>
    </>
  );
}
