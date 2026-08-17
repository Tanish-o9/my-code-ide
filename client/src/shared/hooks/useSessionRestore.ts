import { useEffect } from 'react';
import { api } from '../lib/api';
import { useLayoutStore } from '../stores/useLayoutStore';
import type { LayoutNode } from '../stores/useLayoutStore';
import { useEditorStore } from '../stores/useEditorStore';

// Global cache for cursor/scroll positions: tabPath -> positions
export const cursorPositionsCache: Record<string, {
  lineNumber: number;
  column: number;
  scrollTop: number;
  scrollLeft: number;
}> = {};

let saveTimeout: any = null;

export const triggerSessionSave = (workspaceId: string, layoutTree: LayoutNode, activePaneId: string) => {
  if (saveTimeout) clearTimeout(saveTimeout);

  saveTimeout = setTimeout(async () => {
    try {
      await api.put(`/workspaces/${workspaceId}/session`, {
        session: {
          layoutTree,
          activePaneId,
          cursorPositions: cursorPositionsCache,
        }
      });
      console.log('[SessionRestore] Session snapshot saved.');
    } catch (err) {
      console.error('[SessionRestore] Failed to save session:', err);
    }
  }, 3000); // 3-second debounce
};

export const flushSessionSave = async (workspaceId: string, layoutTree: LayoutNode, activePaneId: string) => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  try {
    await api.put(`/workspaces/${workspaceId}/session`, {
      session: {
        layoutTree,
        activePaneId,
        cursorPositions: cursorPositionsCache,
      }
    });
    console.log('[SessionRestore] Session snapshot flushed immediately.');
  } catch (err) {
    console.error('[SessionRestore] Failed to flush session:', err);
  }
};

export function useSessionRestore(workspaceId: string | null) {
  const { layoutTree, activePaneId, resetLayout } = useLayoutStore();
  const { openTab } = useEditorStore();

  // Monitor layout tree modifications to trigger debounced saves
  useEffect(() => {
    if (!workspaceId) return;
    triggerSessionSave(workspaceId, layoutTree, activePaneId);
  }, [layoutTree, activePaneId, workspaceId]);

  // Flush immediately on unmount/workspace change
  useEffect(() => {
    return () => {
      if (workspaceId) {
        flushSessionSave(workspaceId, useLayoutStore.getState().layoutTree, useLayoutStore.getState().activePaneId);
      }
    };
  }, [workspaceId]);

  const restoreSession = async (savedSession: any) => {
    if (!workspaceId || !savedSession || !savedSession.layoutTree) {
      // Default blank layout if no session exists
      resetLayout();
      return;
    }

    try {
      // Populate cursor cache
      if (savedSession.cursorPositions) {
        Object.assign(cursorPositionsCache, savedSession.cursorPositions);
      }

      // 1. Traverse and clean layoutTree to filter out deleted files
      // (Uses local verify loop, normally we'd check against backend. If file fails to fetch, openTab handles it).
      const loadPaneFiles = async (node: LayoutNode): Promise<void> => {
        if (node.type === 'leaf') {
          for (const path of node.openTabs) {
            // Open the file inside the EditorStore to fetch contents
            await openTab(workspaceId, path);
          }
        } else {
          await loadPaneFiles(node.children[0]);
          await loadPaneFiles(node.children[1]);
        }
      };

      await loadPaneFiles(savedSession.layoutTree);

      // 2. Apply layout tree to layout store
      useLayoutStore.setState({
        layoutTree: savedSession.layoutTree,
        activePaneId: savedSession.activePaneId || savedSession.layoutTree.id,
      });

      console.log('[SessionRestore] Session restored successfully.');
    } catch (err) {
      console.error('[SessionRestore] Error restoring session:', err);
      resetLayout();
    }
  };

  return { restoreSession };
}
