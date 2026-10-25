import React from 'react';
import AdminStats from './AdminStats';
import DocumentEditor from '../documents/DocumentEditor';
import DocumentTable from '../documents/DocumentTable';
import ChunkReview from '../documents/ChunkReview';
import SystemPromptEditor from './SystemPromptEditor';
import Drawer from '../../shared/components/Drawer';
import { useAdminDashboard } from './useAdminDashboard';
import { UI_LABELS, ADMIN_PANELS } from '../../shared/constants';

/**
 * Dedicated dashboard component for Knowledge Base management.
 * Coordinates document editing, chunk review, system prompt configuration,
 * and vector sync status cards.
 */
export default function AdminKnowledgeBaseDashboard({
  health,
  onRefreshHealth,
  isOffline: propIsOffline,
}) {
  const isOffline = propIsOffline ?? Boolean(health?.error);
  const {
    loading,
    drawer,
    chunksState,
    kb,
    docs,
  } = useAdminDashboard({ isOffline });

  return (
    <>
      {/* 1. Status Cards */}
      <AdminStats status={kb.status} indexing={kb.indexing} />

      {/* 2. Management Navigation Bar */}
      <div className="dashboard-content-layout">
        <nav className="dashboard-nav" aria-label="Admin panels">
          <button
            type="button"
            className={`btn ${drawer.isDrawerOpen && drawer.activePanel === ADMIN_PANELS.DOCUMENTS ? 'btn-primary' : 'btn-secondary'}`}
            onClick={(e) => drawer.openDrawer(ADMIN_PANELS.DOCUMENTS, e)}
            aria-expanded={drawer.isDrawerOpen && drawer.activePanel === ADMIN_PANELS.DOCUMENTS}
            aria-controls="admin-drawer"
          >
            {UI_LABELS.ADMIN_DASHBOARD.NAV_DOCUMENTS}
          </button>
          <button
            type="button"
            className={`btn ${drawer.isDrawerOpen && drawer.activePanel === ADMIN_PANELS.CHUNKS ? 'btn-primary' : 'btn-secondary'}`}
            onClick={(e) => drawer.openDrawer(ADMIN_PANELS.CHUNKS, e)}
            aria-expanded={drawer.isDrawerOpen && drawer.activePanel === ADMIN_PANELS.CHUNKS}
            aria-controls="admin-drawer"
          >
            {UI_LABELS.ADMIN_DASHBOARD.NAV_CHUNKS}
          </button>
          <button
            type="button"
            className={`btn ${drawer.isDrawerOpen && drawer.activePanel === ADMIN_PANELS.PROMPT ? 'btn-primary' : 'btn-secondary'}`}
            onClick={(e) => drawer.openDrawer(ADMIN_PANELS.PROMPT, e)}
            aria-expanded={drawer.isDrawerOpen && drawer.activePanel === ADMIN_PANELS.PROMPT}
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
        title={drawer.getDrawerTitle()}
        drawerRef={drawer.drawerRef}
      >
        {/* Documents Management & Inline Editor */}
        {drawer.activePanel === ADMIN_PANELS.DOCUMENTS && (
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
        {drawer.activePanel === ADMIN_PANELS.CHUNKS && (
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
        {drawer.activePanel === ADMIN_PANELS.PROMPT && (
          <SystemPromptEditor isOffline={isOffline} />
        )}
      </Drawer>
    </>
  );
}
