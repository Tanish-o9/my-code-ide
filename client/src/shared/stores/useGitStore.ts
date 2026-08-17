import { create } from 'zustand';
import { api } from '../../shared/lib/api';

export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  isBinary: boolean;
  hunks: DiffHunk[];
}

interface GitState {
  activeBranch: string;
  branches: string[];
  staged: string[];
  unstaged: string[];
  untracked: string[];
  conflicted: string[];
  selectedFileDiff: FileDiff[] | null;
  selectedFileName: string | null;
  isStagedDiff: boolean;
  loading: boolean;
  error: string | null;
  
  // Remote / Sync settings (Modules 66, 67)
  syncAhead: number;
  syncBehind: number;
  remoteUrl: string;
  remoteAuthType: 'token' | 'ssh';
  sshPublicKey: string;
  hasRemoteCredentials: boolean;
  history: any[];

  fetchStatus: (workspaceId: string) => Promise<void>;
  fetchBranches: (workspaceId: string) => Promise<void>;
  fetchDiff: (workspaceId: string, filePath: string, staged: boolean) => Promise<void>;
  stageFiles: (workspaceId: string, files: string[]) => Promise<void>;
  unstageFiles: (workspaceId: string, files: string[]) => Promise<void>;
  commit: (workspaceId: string, message: string, amend: boolean) => Promise<void>;
  switchBranch: (workspaceId: string, branchName: string, force?: boolean | 'stash') => Promise<{ success: boolean; code?: string; message?: string }>;
  createBranch: (workspaceId: string, branchName: string) => Promise<void>;
  clearDiff: () => void;
  
  fetchSyncStatus: (workspaceId: string) => Promise<void>;
  fetchRemoteSettings: (workspaceId: string) => Promise<void>;
  configureRemoteSettings: (workspaceId: string, data: { remoteUrl: string; authType: 'token' | 'ssh'; token?: string; sshPrivateKey?: string }) => Promise<string>;
  push: (workspaceId: string) => Promise<{ success: boolean; code?: string; message?: string }>;
  pull: (workspaceId: string) => Promise<{ success: boolean; code?: string; message?: string }>;
  fetchHistory: (workspaceId: string) => Promise<void>;
  initRepo: (workspaceId: string) => Promise<void>;
  cloneRepo: (workspaceId: string, url: string) => Promise<void>;
  discardChanges: (workspaceId: string, filePath: string) => Promise<void>;
  stashChanges: (workspaceId: string, action: 'push' | 'pop' | 'list', message?: string) => Promise<any>;
  rebase: (workspaceId: string, branch: string) => Promise<{ success: boolean; stdout?: string; stderr?: string }>;
  cherryPick: (workspaceId: string, hash: string) => Promise<{ success: boolean; stdout?: string; stderr?: string }>;
}

export const useGitStore = create<GitState>((set, get) => ({
  activeBranch: '',
  branches: [],
  staged: [],
  unstaged: [],
  untracked: [],
  conflicted: [],
  selectedFileDiff: null,
  selectedFileName: null,
  isStagedDiff: false,
  loading: false,
  error: null,
  
  syncAhead: 0,
  syncBehind: 0,
  remoteUrl: '',
  remoteAuthType: 'token',
  sshPublicKey: '',
  hasRemoteCredentials: false,
  history: [],

  fetchStatus: async (workspaceId) => {
    set({ loading: true, error: null });
    try {
      const res = await api.get(`/workspaces/${workspaceId}/git/status`);
      set({
        staged: res.data.staged,
        unstaged: res.data.unstaged,
        untracked: res.data.untracked,
        conflicted: res.data.conflicted || [],
        loading: false,
      });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to fetch status', loading: false });
    }
  },

  fetchBranches: async (workspaceId) => {
    try {
      const res = await api.get(`/workspaces/${workspaceId}/git/branches`);
      set({
        branches: res.data.branches,
        activeBranch: res.data.activeBranch,
      });
    } catch (err: any) {
      console.error('Failed to fetch branches:', err);
    }
  },

  fetchDiff: async (workspaceId, filePath, staged) => {
    set({ loading: true, error: null });
    try {
      const res = await api.get(`/workspaces/${workspaceId}/git/diff`, {
        params: { file: filePath, staged },
      });
      set({
        selectedFileDiff: res.data,
        selectedFileName: filePath,
        isStagedDiff: staged,
        loading: false,
      });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to fetch diff', loading: false });
    }
  },

  stageFiles: async (workspaceId, files) => {
    try {
      await api.post(`/workspaces/${workspaceId}/git/stage`, { files });
      await get().fetchStatus(workspaceId);
      // Refresh current diff view if any
      const { selectedFileName, isStagedDiff } = get();
      if (selectedFileName && files.includes(selectedFileName)) {
        await get().fetchDiff(workspaceId, selectedFileName, !isStagedDiff);
      }
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to stage files' });
    }
  },

  unstageFiles: async (workspaceId, files) => {
    try {
      await api.post(`/workspaces/${workspaceId}/git/unstage`, { files });
      await get().fetchStatus(workspaceId);
      // Refresh current diff view if any
      const { selectedFileName, isStagedDiff } = get();
      if (selectedFileName && files.includes(selectedFileName)) {
        await get().fetchDiff(workspaceId, selectedFileName, !isStagedDiff);
      }
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to unstage files' });
    }
  },

  commit: async (workspaceId, message, amend) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/workspaces/${workspaceId}/git/commit`, { message, amend });
      await get().fetchStatus(workspaceId);
      set({ selectedFileDiff: null, selectedFileName: null, loading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Commit failed', loading: false });
      throw err;
    }
  },

  switchBranch: async (workspaceId, branchName, force) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/workspaces/${workspaceId}/git/branches/switch`, {
        branchName,
        force,
      });
      set({ loading: false });
      await get().fetchBranches(workspaceId);
      await get().fetchStatus(workspaceId);
      return { success: true };
    } catch (err: any) {
      set({ loading: false });
      if (err.response?.status === 409) {
        return {
          success: false,
          code: err.response.data.code,
          message: err.response.data.message,
        };
      }
      set({ error: err.response?.data?.error || 'Failed to switch branch' });
      return { success: false, message: err.response?.data?.error || 'Failed to switch branch' };
    }
  },

  createBranch: async (workspaceId, branchName) => {
    try {
      await api.post(`/workspaces/${workspaceId}/git/branches`, { branchName });
      await get().fetchBranches(workspaceId);
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to create branch' });
      throw err;
    }
  },

  clearDiff: () => set({ selectedFileDiff: null, selectedFileName: null }),

  fetchSyncStatus: async (workspaceId) => {
    try {
      const res = await api.get(`/workspaces/${workspaceId}/git/sync-status`);
      set({
        syncAhead: res.data.ahead,
        syncBehind: res.data.behind,
      });
    } catch (err: any) {
      console.error('Failed to fetch sync status:', err);
    }
  },

  fetchRemoteSettings: async (workspaceId) => {
    try {
      const res = await api.get(`/workspaces/${workspaceId}/git/remote`);
      set({
        remoteUrl: res.data.remoteUrl,
        remoteAuthType: res.data.authType,
        sshPublicKey: res.data.sshPublicKey,
        hasRemoteCredentials: res.data.hasKey,
      });
    } catch (err: any) {
      console.error('Failed to fetch remote settings:', err);
    }
  },

  configureRemoteSettings: async (workspaceId, data) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post(`/workspaces/${workspaceId}/git/remote`, data);
      set({
        remoteUrl: data.remoteUrl,
        remoteAuthType: data.authType,
        sshPublicKey: res.data.sshPublicKey,
        hasRemoteCredentials: true,
        loading: false,
      });
      return res.data.sshPublicKey || '';
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to save remote credentials';
      set({ error: errorMsg, loading: false });
      throw new Error(errorMsg);
    }
  },

  push: async (workspaceId) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post(`/workspaces/${workspaceId}/git/push`);
      set({ loading: false });
      await get().fetchSyncStatus(workspaceId);
      return { success: true, message: res.data.message };
    } catch (err: any) {
      set({ loading: false });
      if (err.response?.status === 400 || err.response?.status === 401) {
        return {
          success: false,
          code: err.response.data.code,
          message: err.response.data.message,
        };
      }
      return { success: false, message: 'Push operation failed' };
    }
  },

  pull: async (workspaceId) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post(`/workspaces/${workspaceId}/git/pull`);
      set({ loading: false });
      await get().fetchStatus(workspaceId);
      await get().fetchSyncStatus(workspaceId);
      return { success: true, message: res.data.message };
    } catch (err: any) {
      set({ loading: false });
      if (err.response?.status === 400 || err.response?.status === 401) {
        return {
          success: false,
          code: err.response.data.code,
          message: err.response.data.message,
        };
      }
      return { success: false, message: 'Pull operation failed' };
    }
  },

  fetchHistory: async (workspaceId) => {
    try {
      const res = await api.get(`/workspaces/${workspaceId}/git/history`);
      set({ history: res.data });
    } catch (err) {
      console.error('Failed to fetch git history:', err);
    }
  },

  initRepo: async (workspaceId) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/workspaces/${workspaceId}/git/init`);
      set({ loading: false });
      await get().fetchStatus(workspaceId);
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to initialize repo', loading: false });
    }
  },

  cloneRepo: async (workspaceId, url) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/workspaces/${workspaceId}/git/clone`, { url });
      set({ loading: false });
      await get().fetchStatus(workspaceId);
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to clone repo', loading: false });
    }
  },

  discardChanges: async (workspaceId, filePath) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/workspaces/${workspaceId}/git/discard`, { path: filePath });
      set({ loading: false });
      await get().fetchStatus(workspaceId);
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to discard changes', loading: false });
    }
  },

  stashChanges: async (workspaceId, action, message) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post(`/workspaces/${workspaceId}/git/stash`, { action, message });
      set({ loading: false });
      await get().fetchStatus(workspaceId);
      return res.data;
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to stash changes', loading: false });
      throw err;
    }
  },

  rebase: async (workspaceId, branch) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post(`/workspaces/${workspaceId}/git/rebase`, { branch });
      set({ loading: false });
      await get().fetchStatus(workspaceId);
      return res.data;
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to rebase', loading: false });
      return { success: false, stderr: err.message };
    }
  },

  cherryPick: async (workspaceId, hash) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post(`/workspaces/${workspaceId}/git/cherry-pick`, { hash });
      set({ loading: false });
      await get().fetchStatus(workspaceId);
      return res.data;
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to cherry-pick', loading: false });
      return { success: false, stderr: err.message };
    }
  },
}));
