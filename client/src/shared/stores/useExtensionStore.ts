import { create } from 'zustand';
import { api } from '../lib/api';
import { getExtensionsSocket } from '../lib/socket';

export interface ExtensionManifest {
  name: string;
  version: string;
  publisher: string;
  description?: string;
  activationEvents: string[];
  permissions: string[];
  settingsSchema?: Record<string, {
    type: 'string' | 'number' | 'boolean';
    default: any;
    description?: string;
  }>;
  entryPath: string;
}

export interface InstalledExtension {
  _id: string;
  extensionId: string;
  manifest: ExtensionManifest;
  active: boolean;
  settings: Record<string, any>;
  createdAt: Date;
}

export interface ExtensionListing {
  _id: string;
  extensionId: string;
  name: string;
  publisher: string;
  description: string;
  latestVersion: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  downloadCount: number;
  versions: { version: string; entryPath: string; manifest: ExtensionManifest; createdAt: Date }[];
  categories?: string[];
  rating?: number;
  ratingCount?: number;
}

export interface StatusBarItemContribution {
  id: string;
  text: string;
  tooltip?: string;
  extensionId: string;
}

interface ExtensionState {
  marketplaceListings: ExtensionListing[];
  installedExtensions: InstalledExtension[];
  statusBarItems: StatusBarItemContribution[];
  contributedCommands: { id: string; extensionId: string }[];
  loading: boolean;
  error: string | null;

  fetchMarketplaceListings: (searchQuery?: string) => Promise<void>;
  fetchInstalledExtensions: () => Promise<void>;
  installExtension: (extensionId: string) => Promise<void>;
  toggleExtension: (id: string, active: boolean, workspaceId: string) => Promise<void>;
  uninstallExtension: (id: string, workspaceId: string) => Promise<void>;
  updateExtensionSettings: (id: string, settings: Record<string, any>) => Promise<void>;
  publishExtension: (manifest: any, code: string) => Promise<any>;
  installVsix: (file: File) => Promise<void>;
  rateExtension: (extensionId: string, rating: number) => Promise<void>;

  connectWorkspaceSocket: (workspaceId: string) => void;
  executeContributedCommand: (extensionId: string, commandId: string, args?: any[]) => Promise<any>;
}

export const useExtensionStore = create<ExtensionState>((set) => {
  return {
    marketplaceListings: [],
    installedExtensions: [],
    statusBarItems: [],
    contributedCommands: [],
    loading: false,
    error: null,

    fetchMarketplaceListings: async (searchQuery) => {
      set({ loading: true, error: null });
      try {
        const res = await api.get('/extensions/marketplace', {
          params: searchQuery ? { search: searchQuery } : undefined
        });
        set({ marketplaceListings: res.data, loading: false });
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to search marketplace', loading: false });
      }
    },

    fetchInstalledExtensions: async () => {
      set({ loading: true, error: null });
      try {
        const res = await api.get('/extensions/installed');
        set({ installedExtensions: res.data, loading: false });
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to fetch installed extensions', loading: false });
      }
    },

    installExtension: async (extensionId) => {
      set({ loading: true, error: null });
      try {
        const res = await api.post('/extensions/install', { extensionId });
        set((state) => ({
          installedExtensions: [...state.installedExtensions, res.data],
          loading: false
        }));
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to install extension', loading: false });
        throw err;
      }
    },

    toggleExtension: async (id, active, workspaceId) => {
      set({ loading: true, error: null });
      try {
        const res = await api.post(`/extensions/toggle/${id}`, { active, workspaceId });
        set((state) => ({
          installedExtensions: state.installedExtensions.map((e) => e._id === id ? res.data : e),
          loading: false
        }));
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to toggle extension status', loading: false });
      }
    },

    uninstallExtension: async (id, workspaceId) => {
      set({ loading: true, error: null });
      try {
        await api.delete(`/extensions/uninstall/${id}`, { data: { workspaceId } });
        set((state) => ({
          installedExtensions: state.installedExtensions.filter((e) => e._id !== id),
          loading: false
        }));
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to uninstall extension', loading: false });
      }
    },

    updateExtensionSettings: async (id, settings) => {
      try {
        const res = await api.put(`/extensions/settings/${id}`, { settings });
        set((state) => ({
          installedExtensions: state.installedExtensions.map((e) => e._id === id ? res.data : e)
        }));
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to save settings' });
      }
    },

    publishExtension: async (manifest, code) => {
      set({ loading: true, error: null });
      try {
        const res = await api.post('/extensions/publish', { manifest, code });
        set({ loading: false });
        return res.data;
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to publish extension', loading: false });
        throw err;
      }
    },

    connectWorkspaceSocket: (workspaceId) => {
      const socket = getExtensionsSocket();
      if (!socket.connected) {
        socket.connect();
      }

      socket.emit('join', workspaceId);

      socket.off('extension:command-registered');
      socket.off('extension:statusbar-updated');
      socket.off('extension:contributions-cleaned');

      socket.on('extension:command-registered', (data: { id: string; extensionId: string }) => {
        set((state) => {
          if (state.contributedCommands.some((c) => c.id === data.id)) return state;
          return { contributedCommands: [...state.contributedCommands, data] };
        });
      });

      socket.on('extension:statusbar-updated', (items: StatusBarItemContribution[]) => {
        set({ statusBarItems: items });
      });

      socket.on('extension:contributions-cleaned', (data: { extensionId: string; commands: string[]; statusBarItems: any[] }) => {
        set((state) => ({
          contributedCommands: state.contributedCommands.filter((c) => c.extensionId !== data.extensionId),
          statusBarItems: state.statusBarItems.filter((i) => i.extensionId !== data.extensionId)
        }));
      });
    },

    executeContributedCommand: (extensionId, commandId, args = []) => {
      const socket = getExtensionsSocket();
      return new Promise((resolve, reject) => {
        socket.emit('extension:execute-command', { extensionId, commandId, args }, (res: any) => {
          if (res.success) {
            resolve(res.result);
          } else {
            reject(new Error(res.error || 'Command execution failed'));
          }
        });
      });
    },

    installVsix: async (file) => {
      set({ loading: true, error: null });
      try {
        const formData = new FormData();
        formData.append('vsix', file);
        const res = await api.post('/extensions/install-vsix', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        set((state) => ({
          installedExtensions: [...state.installedExtensions, res.data.installed],
          loading: false
        }));
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'VSIX installation failed', loading: false });
        throw err;
      }
    },

    rateExtension: async (extensionId, rating) => {
      try {
        const res = await api.post('/extensions/rate', { extensionId, rating });
        set((state) => ({
          marketplaceListings: state.marketplaceListings.map((l) =>
            l.extensionId === extensionId
              ? { ...l, rating: res.data.rating, ratingCount: res.data.ratingCount }
              : l
          )
        }));
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to submit rating' });
      }
    }
  };
});
