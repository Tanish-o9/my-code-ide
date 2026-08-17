import { create } from 'zustand';
import { api } from '../lib/api';
import { useLayoutStore } from './useLayoutStore';

export interface Tab {
  path: string;
  content: string;
  isDirty: boolean;
  lastSavedAt?: Date;
}

interface EditorState {
  openTabs: Tab[];
  activeTab: string | null;
  isLoadingFile: boolean;
  pendingLineFocus: { path: string; line: number } | null;

  openTab: (workspaceId: string, path: string) => Promise<void>;
  createUntitledFile: () => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string | null) => void;
  updateTabContent: (workspaceId: string, path: string, content: string) => void;
  saveTab: (workspaceId: string, path: string) => Promise<void>;
  reorderTabs: (srcIndex: number, destIndex: number) => void;
  closeOthers: (path: string) => void;
  closeAll: () => void;
  closeSaved: () => void;
  focusLine: (path: string, line: number) => void;
  clearLineFocus: () => void;
}

// Map to track auto-save timeouts for each file path
const saveTimeouts: Record<string, any> = {};

export const useEditorStore = create<EditorState>((set, get) => ({
  openTabs: [],
  activeTab: null,
  isLoadingFile: false,
  pendingLineFocus: null,

  openTab: async (workspaceId, path) => {
    const { openTabs } = get();
    const existingTab = openTabs.find((t) => t.path === path);

    if (existingTab) {
      set({ activeTab: path });
      useLayoutStore.getState().openTab(path);
      return;
    }

    if (path.startsWith('Untitled-')) {
      const newTab: Tab = {
        path,
        content: '',
        isDirty: true,
        lastSavedAt: undefined,
      };
      set({
        openTabs: [...openTabs, newTab],
        activeTab: path,
        isLoadingFile: false,
      });
      useLayoutStore.getState().openTab(path);
      return;
    }

    if (path.startsWith('git-diff:')) {
      const newTab: Tab = {
        path,
        content: '',
        isDirty: false,
        lastSavedAt: undefined,
      };
      set({
        openTabs: [...openTabs, newTab],
        activeTab: path,
        isLoadingFile: false,
      });
      useLayoutStore.getState().openTab(path);
      return;
    }

    if (path === 'welcome' || path === 'playground') {
      const newTab: Tab = {
        path,
        content: '',
        isDirty: false,
        lastSavedAt: undefined,
      };
      set({
        openTabs: [...openTabs, newTab],
        activeTab: path,
        isLoadingFile: false,
      });
      useLayoutStore.getState().openTab(path);
      return;
    }

    set({ isLoadingFile: true });

    try {
      // Fetch file content from backend
      const response = await api.get(`/workspaces/${workspaceId}/files/content`, {
        params: { path }
      });
      
      const content = response.data.content;
      const newTab: Tab = {
        path,
        content,
        isDirty: false,
        lastSavedAt: new Date(),
      };

      set({
        openTabs: [...openTabs, newTab],
        activeTab: path,
        isLoadingFile: false,
      });

      useLayoutStore.getState().openTab(path);
    } catch (err) {
      console.error(`[EditorStore] Failed to open file "${path}":`, err);
      set({ isLoadingFile: false });
    }
  },

  createUntitledFile: () => {
    const { openTabs } = get();
    let i = 1;
    while (openTabs.some((t) => t.path === `Untitled-${i}`)) {
      i++;
    }
    const newPath = `Untitled-${i}`;
    const newTab: Tab = {
      path: newPath,
      content: '',
      isDirty: true,
      lastSavedAt: undefined,
    };
    set({
      openTabs: [...openTabs, newTab],
      activeTab: newPath,
    });
    useLayoutStore.getState().openTab(newPath);
  },

  closeTab: (path) => {
    const { openTabs, activeTab } = get();
    const updatedTabs = openTabs.filter((t) => t.path !== path);

    // Clean up any pending autosave timeouts for this tab
    if (saveTimeouts[path]) {
      clearTimeout(saveTimeouts[path]);
      delete saveTimeouts[path];
    }

    let newActiveTab = activeTab;
    if (activeTab === path) {
      newActiveTab = updatedTabs.length > 0 ? updatedTabs[updatedTabs.length - 1].path : null;
    }

    set({
      openTabs: updatedTabs,
      activeTab: newActiveTab,
    });
  },

  setActiveTab: (path) => set({ activeTab: path }),

  updateTabContent: (workspaceId, path, content) => {
    const { openTabs } = get();
    
    // Update local state with the new content and mark tab as dirty
    const updatedTabs = openTabs.map((t) => {
      if (t.path === path) {
        return { ...t, content, isDirty: true };
      }
      return t;
    });

    set({ openTabs: updatedTabs });

    // Cancel existing autosave timeout for this file
    if (saveTimeouts[path]) {
      clearTimeout(saveTimeouts[path]);
      delete saveTimeouts[path];
    }

    // Always trigger auto-save if not an Untitled unsaved tab
    if (!path.startsWith('Untitled-')) {
      saveTimeouts[path] = setTimeout(() => {
        get().saveTab(workspaceId, path);
      }, 1000);
    }
  },

  saveTab: async (workspaceId, path) => {
    // Clear any pending autosave timeout
    if (saveTimeouts[path]) {
      clearTimeout(saveTimeouts[path]);
      delete saveTimeouts[path];
    }

    const { openTabs } = get();
    const tab = openTabs.find((t) => t.path === path);
    if (!tab || !tab.isDirty) return;

    try {
      // Write content to backend filesystem
      await api.put(`/workspaces/${workspaceId}/files/content`, {
        path,
        content: tab.content,
      });

      // Clear dirty flag and set save timestamp
      set((state) => ({
        openTabs: state.openTabs.map((t) => {
          if (t.path === path) {
            return { ...t, isDirty: false, lastSavedAt: new Date() };
          }
          return t;
        }),
      }));

      console.log(`[EditorStore] Saved file: ${path}`);
    } catch (err) {
      console.error(`[EditorStore] Failed to save file "${path}":`, err);
    }
  },

  reorderTabs: (srcIndex, destIndex) => {
    set((state) => {
      const openTabs = [...state.openTabs];
      const [moved] = openTabs.splice(srcIndex, 1);
      openTabs.splice(destIndex, 0, moved);
      return { openTabs };
    });
  },

  closeOthers: (path) => {
    const { openTabs } = get();
    openTabs.forEach((t) => {
      if (t.path !== path) {
        if (saveTimeouts[t.path]) {
          clearTimeout(saveTimeouts[t.path]);
          delete saveTimeouts[t.path];
        }
      }
    });

    const keptTab = openTabs.find((t) => t.path === path);
    set({
      openTabs: keptTab ? [keptTab] : [],
      activeTab: keptTab ? path : null,
    });
  },

  closeAll: () => {
    const { openTabs } = get();
    openTabs.forEach((t) => {
      if (saveTimeouts[t.path]) {
        clearTimeout(saveTimeouts[t.path]);
        delete saveTimeouts[t.path];
      }
    });
    set({ openTabs: [], activeTab: null });
  },

  closeSaved: () => {
    const { openTabs, activeTab } = get();
    const unsavedTabs = openTabs.filter((t) => {
      if (!t.isDirty) {
        if (saveTimeouts[t.path]) {
          clearTimeout(saveTimeouts[t.path]);
          delete saveTimeouts[t.path];
        }
        return false;
      }
      return true;
    });

    let newActiveTab = activeTab;
    if (activeTab && !unsavedTabs.some((t) => t.path === activeTab)) {
      newActiveTab = unsavedTabs.length > 0 ? unsavedTabs[unsavedTabs.length - 1].path : null;
    }

    set({ openTabs: unsavedTabs, activeTab: newActiveTab });
  },

  focusLine: (path, line) => {
    set({ pendingLineFocus: { path, line } });
  },

  clearLineFocus: () => {
    set({ pendingLineFocus: null });
  },
}));
