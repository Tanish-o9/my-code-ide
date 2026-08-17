import { create } from 'zustand';
import { getTerminalSocket } from '../lib/socket';

export interface TerminalTab {
  id: string;
  name: string;
}

interface TerminalState {
  sessions: TerminalTab[];
  activeSessionId: string | null;
  hasSpawnedInitial: boolean;
  
  createTerminal: (workspaceId: string, initialCommand?: string) => string;
  runCommandInTerminal: (workspaceId: string, command: string) => void;
  closeTerminal: (workspaceId: string, sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  renameTerminal: (sessionId: string, newName: string) => void;
  resetStore: () => void;
}

const generateSessionId = () => Math.random().toString(36).substring(2, 10);

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  hasSpawnedInitial: false,

  createTerminal: (workspaceId: string, initialCommand?: string) => {
    const { sessions } = get();
    const newSessionId = `term-${generateSessionId()}`;
    const newTab: TerminalTab = {
      id: newSessionId,
      name: initialCommand ? `Run: ${initialCommand.split(' ').slice(0, 2).join(' ')}` : `Terminal ${sessions.length + 1}`,
    };

    const updatedSessions = [...sessions, newTab];
    set({
      sessions: updatedSessions,
      activeSessionId: newSessionId,
      hasSpawnedInitial: true,
    });

    // Notify backend socket to spawn new PTY
    const socket = getTerminalSocket();
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('join', workspaceId);
    socket.emit('create-session', {
      workspaceId,
      sessionId: newSessionId,
      cols: 80,
      rows: 24,
      customCommand: initialCommand,
    });

    return newSessionId;
  },

  runCommandInTerminal: (workspaceId: string, command: string) => {
    const { activeSessionId } = get();
    const socket = getTerminalSocket();
    if (activeSessionId) {
      if (!socket.connected) {
        socket.connect();
      }
      socket.emit('join', workspaceId);
      socket.emit('input', { sessionId: activeSessionId, data: `${command}\n` });
    } else {
      get().createTerminal(workspaceId, command);
    }
  },

  closeTerminal: (_workspaceId: string, sessionId: string) => {
    const { sessions, activeSessionId } = get();
    
    // Notify backend to terminate PTY process
    const socket = getTerminalSocket();
    socket.emit('close-session', { sessionId });

    const updatedSessions = sessions.filter((s) => s.id !== sessionId);

    let newActiveId = activeSessionId;
    if (activeSessionId === sessionId) {
      newActiveId = updatedSessions.length > 0 ? updatedSessions[updatedSessions.length - 1].id : null;
    }

    set({
      sessions: updatedSessions,
      activeSessionId: newActiveId,
    });
  },

  setActiveSession: (sessionId: string) => {
    set({ activeSessionId: sessionId });
  },

  renameTerminal: (sessionId: string, newName: string) => {
    const { sessions } = get();
    const updated = sessions.map((s) => (s.id === sessionId ? { ...s, name: newName } : s));
    set({ sessions: updated });
  },

  resetStore: () => {
    set({ sessions: [], activeSessionId: null, hasSpawnedInitial: false });
  },
}));
