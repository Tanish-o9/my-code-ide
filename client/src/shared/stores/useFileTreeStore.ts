import { create } from 'zustand';
import { api } from '../lib/api';

export interface FileNodeInfo {
  name: string;
  path: string; // Relative to workspace root
  type: 'file' | 'folder';
  size?: number;
  lastModified?: string;
  children?: FileNodeInfo[];
}

interface FileTreeState {
  // Map of folder path to its immediate children for efficient lazy-loading
  filesByFolder: Record<string, FileNodeInfo[]>;
  expandedFolders: Record<string, boolean>;
  isLoading: Record<string, boolean>;
  
  toggleFolder: (folderPath: string) => void;
  fetchDirectory: (workspaceId: string, dirPath: string) => Promise<void>;
  createItem: (workspaceId: string, relPath: string, type: 'file' | 'folder') => Promise<void>;
  deleteItem: (workspaceId: string, relPath: string) => Promise<void>;
  renameItem: (workspaceId: string, oldPath: string, newPath: string) => Promise<void>;
  
  // Real-time synchronization methods (called by socket listeners)
  onFileCreated: (relPath: string, type: 'file' | 'folder') => void;
  onFileChanged: (relPath: string) => void;
  onFileDeleted: (relPath: string) => void;
}

export const useFileTreeStore = create<FileTreeState>((set, get) => ({
  filesByFolder: {},
  expandedFolders: {},
  isLoading: {},

  toggleFolder: (folderPath) => set((state) => ({
    expandedFolders: {
      ...state.expandedFolders,
      [folderPath]: !state.expandedFolders[folderPath],
    }
  })),

  fetchDirectory: async (workspaceId, dirPath) => {
    set((state) => ({
      isLoading: { ...state.isLoading, [dirPath]: true }
    }));

    try {
      const response = await api.get(`/workspaces/${workspaceId}/files`, {
        params: { path: dirPath }
      });
      
      const contents: FileNodeInfo[] = response.data;
      
      set((state) => ({
        filesByFolder: {
          ...state.filesByFolder,
          [dirPath]: contents,
        },
        isLoading: { ...state.isLoading, [dirPath]: false }
      }));
    } catch (err) {
      console.error(`[FileTreeStore] Fetch error for folder "${dirPath}":`, err);
      set((state) => ({
        isLoading: { ...state.isLoading, [dirPath]: false }
      }));
    }
  },

  createItem: async (workspaceId, relPath, type) => {
    try {
      await api.post(`/workspaces/${workspaceId}/files/item`, {
        path: relPath,
        type,
      });
      // Local state is updated via the websocket callback or manually
      get().onFileCreated(relPath, type);
    } catch (err) {
      console.error('[FileTreeStore] Create item error:', err);
      throw err;
    }
  },

  deleteItem: async (workspaceId, relPath) => {
    try {
      await api.delete(`/workspaces/${workspaceId}/files/item`, {
        params: { path: relPath }
      });
      get().onFileDeleted(relPath);
    } catch (err) {
      console.error('[FileTreeStore] Delete item error:', err);
      throw err;
    }
  },

  renameItem: async (workspaceId, oldPath, newPath) => {
    try {
      await api.post(`/workspaces/${workspaceId}/files/rename`, {
        oldPath,
        newPath
      });
      get().onFileDeleted(oldPath);
      get().onFileCreated(newPath, 'file');
    } catch (err) {
      console.error('[FileTreeStore] Rename item error:', err);
      throw err;
    }
  },

  onFileCreated: (relPath, type) => {
    const parentPath = relPath.includes('/') 
      ? relPath.substring(0, relPath.lastIndexOf('/')) 
      : '';
    const name = relPath.includes('/')
      ? relPath.substring(relPath.lastIndexOf('/') + 1)
      : relPath;

    set((state) => {
      const folderContents = state.filesByFolder[parentPath] || [];
      // Don't add duplicate
      if (folderContents.some((f) => f.path === relPath)) return {};

      const newItem: FileNodeInfo = {
        name,
        path: relPath,
        type,
      };

      return {
        filesByFolder: {
          ...state.filesByFolder,
          [parentPath]: [...folderContents, newItem].sort((a, b) => {
            // Folders first, then files alphabetically
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
          }),
        }
      };
    });
  },

  onFileChanged: (relPath) => {
    // Filesystem updates can reload stats
    console.log(`[FileTreeStore] File modified: ${relPath}`);
  },

  onFileDeleted: (relPath) => {
    const parentPath = relPath.includes('/') 
      ? relPath.substring(0, relPath.lastIndexOf('/')) 
      : '';

    set((state) => {
      const folderContents = state.filesByFolder[parentPath] || [];
      const updatedContents = folderContents.filter((f) => f.path !== relPath);

      // Clean up cached folder entries if it was a folder itself
      const newFilesByFolder = { ...state.filesByFolder };
      delete newFilesByFolder[relPath];

      return {
        filesByFolder: {
          ...newFilesByFolder,
          [parentPath]: updatedContents,
        }
      };
    });
  },
}));
