import { useState, useCallback } from 'react';
import { useDrawer as useSharedDrawer } from '../../shared/hooks/useDrawer';
import { UI_LABELS, ADMIN_PANELS } from '../../shared/constants';

/**
 * Knowledge Base drawer hook.
 * Composes shared drawer state and provides panel-switching and title-resolution logic.
 */
export function useKnowledgeBaseDrawer(initialPanel = ADMIN_PANELS.DOCUMENTS) {
  const [activePanel, setActivePanel] = useState(initialPanel);
  const drawer = useSharedDrawer();

  const openDrawer = useCallback((panelName, event) => {
    if (panelName) {
      setActivePanel(panelName);
    }
    drawer.openDrawer(event);
  }, [drawer]);

  const getDrawerTitle = useCallback(() => {
    switch (activePanel) {
      case ADMIN_PANELS.CHUNKS:
        return UI_LABELS.CHUNK_REVIEW.TITLE;
      case ADMIN_PANELS.PROMPT:
        return UI_LABELS.SYSTEM_PROMPT_EDITOR.TITLE;
      case ADMIN_PANELS.DOCUMENTS:
      default:
        return UI_LABELS.DOCUMENT_TABLE.TITLE;
    }
  }, [activePanel]);

  return {
    ...drawer,
    activePanel,
    setActivePanel,
    openDrawer,
    getDrawerTitle,
  };
}

export const useDrawer = useKnowledgeBaseDrawer;
