import { create } from 'zustand';

export interface WorkspaceData {
  _id: string;
  name: string;
  templateUsed: string;
  containerStatus: 'stopped' | 'running' | 'provisioning' | 'error';
  lastAccessedAt: string;
  settings: {
    theme: 'light' | 'dark';
    fontSize: number;
    tabSize: number;
    pythonPath?: string;
    pythonDefaultInterpreter?: string;
  };
  session?: any;
}

interface WorkspaceState {
  workspaces: WorkspaceData[];
  activeWorkspace: WorkspaceData | null;
  isLoading: boolean;
  showCreateModal: boolean;
  
  setWorkspaces: (workspaces: WorkspaceData[]) => void;
  setActiveWorkspace: (workspace: WorkspaceData | null) => void;
  setLoading: (loading: boolean) => void;
  setShowCreateModal: (show: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  activeWorkspace: null,
  isLoading: false,
  showCreateModal: false,

  setWorkspaces: (workspaces) => set({ workspaces }),
  setActiveWorkspace: (activeWorkspace) => set({ activeWorkspace }),
  setLoading: (isLoading) => set({ isLoading }),
  setShowCreateModal: (showCreateModal) => set({ showCreateModal }),
}));
