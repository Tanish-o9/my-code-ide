import { create } from 'zustand';
import { api } from '../lib/api';
import { getDebugSocket } from '../lib/socket';

export interface Breakpoint {
  _id?: string;
  filePath: string;
  line: number;
  enabled: boolean;
  condition?: string;
  logMessage?: string;
  isOrphaned?: boolean;
}

export interface LaunchConfig {
  _id?: string;
  name: string;
  adapterType: 'node' | 'python';
  program: string;
  args: string[];
  env: Record<string, string>;
  mode: 'launch' | 'attach';
}

export interface StackFrame {
  id: number;
  name: string;
  source?: { path: string };
  line: number;
  column: number;
}

export interface Scope {
  name: string;
  variablesReference: number;
  expensive: boolean;
}

export interface Variable {
  name: string;
  value: string;
  variablesReference: number;
}

interface DebugState {
  activeSessionId: string | null;
  status: 'stopped' | 'running' | 'paused';
  launchConfigs: LaunchConfig[];
  activeConfig: LaunchConfig | null;
  breakpoints: Breakpoint[];
  callStack: StackFrame[];
  activeFrameId: number | null;
  scopes: Scope[];
  variables: Record<number, Variable[]>;
  watches: { expression: string; value: string; error?: boolean }[];
  consoleLogs: { category: 'stdout' | 'stderr' | 'console'; text: string; timestamp: Date }[];
  loading: boolean;
  error: string | null;

  fetchLaunchConfigs: (workspaceId: string) => Promise<void>;
  saveLaunchConfig: (workspaceId: string, config: LaunchConfig) => Promise<void>;
  deleteLaunchConfig: (workspaceId: string, configId: string) => Promise<void>;
  setActiveConfig: (config: LaunchConfig | null) => void;

  fetchBreakpoints: (workspaceId: string) => Promise<void>;
  toggleBreakpoint: (workspaceId: string, filePath: string, line: number) => Promise<void>;
  addBreakpointDetails: (workspaceId: string, filePath: string, line: number, condition?: string, logMessage?: string) => Promise<void>;
  removeBreakpoint: (workspaceId: string, filePath: string, line: number) => Promise<void>;
  
  startDebugging: (workspaceId: string) => Promise<void>;
  stopDebugging: () => void;
  sendDAPRequest: (command: string, args?: any) => void;
  
  selectFrame: (frameId: number) => Promise<void>;
  expandVariable: (variablesReference: number) => Promise<void>;
  addWatch: (expression: string) => void;
  removeWatch: (expression: string) => void;
  evaluateREPL: (expression: string) => Promise<void>;
  
  setOrphanedBreakpoint: (filePath: string, line: number) => void;
  resetStore: () => void;
}

export const useDebugStore = create<DebugState>((set, get) => {
  let seqCounter = 1;
  const pendingEvaluations = new Map<number, { type: 'watch' | 'repl'; expression: string }>();

  // Set up listeners on the debug socket singleton
  const setupSocketListeners = (sessionId: string) => {
    const socket = getDebugSocket();
    
    socket.off('dap:message');
    socket.off('dap:stderr');
    socket.off('dap:terminated');
    socket.off('session-error');

    socket.on('dap:message', async (msg: any) => {
      const currentSessionId = get().activeSessionId;
      if (currentSessionId !== sessionId) return;

      if (msg.type === 'event') {
        const { event, body } = msg;
        
        if (event === 'stopped') {
          set({ status: 'paused' });
          // Fetch stack trace automatically
          get().sendDAPRequest('stackTrace', { threadId: body.threadId || 1 });
          
          // Re-evaluate watch expressions
          for (const w of get().watches) {
            const seq = seqCounter++;
            pendingEvaluations.set(seq, { type: 'watch', expression: w.expression });
            socket.emit('dap:request', {
              sessionId,
              message: {
                type: 'request',
                seq,
                command: 'evaluate',
                arguments: { expression: w.expression, context: 'watch' }
              }
            });
          }
        } else if (event === 'continued') {
          set({ status: 'running', callStack: [], scopes: [], variables: {} });
        } else if (event === 'terminated') {
          set({ status: 'stopped', activeSessionId: null, callStack: [], scopes: [], variables: {} });
        } else if (event === 'output') {
          const category = body.category === 'stderr' ? 'stderr' : (body.category === 'stdout' ? 'stdout' : 'console');
          set((state) => ({
            consoleLogs: [...state.consoleLogs, { category, text: body.output, timestamp: new Date() }]
          }));
        }
      } else if (msg.type === 'response') {
        const { command, success, body, message, request_seq } = msg;
        if (!success) {
          console.error(`DAP command failed: ${command} -> ${message}`);
          if (command === 'evaluate') {
            const req = pendingEvaluations.get(request_seq);
            if (req) {
              if (req.type === 'watch') {
                set((state) => ({
                  watches: state.watches.map((w) =>
                    w.expression === req.expression ? { expression: w.expression, value: 'error', error: true } : w
                  ),
                }));
              } else if (req.type === 'repl') {
                set((state) => ({
                  consoleLogs: [
                    ...state.consoleLogs,
                    { category: 'stderr', text: `Error: ${message || 'evaluation failed'}\n`, timestamp: new Date() }
                  ]
                }));
              }
              pendingEvaluations.delete(request_seq);
            }
          }
          return;
        }

        if (command === 'stackTrace') {
          const frames: StackFrame[] = (body.stackFrames || []).map((f: any) => ({
            id: f.id,
            name: f.name,
            source: f.source,
            line: f.line,
            column: f.column,
          }));
          set({ callStack: frames });
          if (frames.length > 0) {
            // Select innermost frame by default
            get().selectFrame(frames[0].id);
          }
        } else if (command === 'scopes') {
          const fetchedScopes: Scope[] = (body.scopes || []).map((s: any) => ({
            name: s.name,
            variablesReference: s.variablesReference,
            expensive: s.expensive,
          }));
          set({ scopes: fetchedScopes });
          // Fetch variables for each non-expensive scope
          for (const scope of fetchedScopes) {
            if (!scope.expensive) {
              get().sendDAPRequest('variables', { variablesReference: scope.variablesReference });
            }
          }
        } else if (command === 'variables') {
          // Store variables in cache map
          const ref = body.variablesReference || request_seq;
          const vars: Variable[] = (body.variables || []).map((v: any) => ({
            name: v.name,
            value: v.value,
            variablesReference: v.variablesReference,
          }));
          set((state) => ({
            variables: { ...state.variables, [ref]: vars }
          }));
        } else if (command === 'evaluate') {
          const req = pendingEvaluations.get(request_seq);
          if (req) {
            if (req.type === 'watch') {
              set((state) => ({
                watches: state.watches.map((w) =>
                  w.expression === req.expression
                    ? { expression: w.expression, value: body?.result || 'undefined', error: false }
                    : w
                ),
              }));
            } else if (req.type === 'repl') {
              set((state) => ({
                consoleLogs: [
                  ...state.consoleLogs,
                  { category: 'console', text: `${body?.result || 'undefined'}\n`, timestamp: new Date() }
                ]
              }));
            }
            pendingEvaluations.delete(request_seq);
          }
        }
      }
    });

    socket.on('dap:stderr', (data: string) => {
      set((state) => ({
        consoleLogs: [...state.consoleLogs, { category: 'stderr', text: data, timestamp: new Date() }]
      }));
    });

    socket.on('dap:terminated', () => {
      set({ status: 'stopped', activeSessionId: null, callStack: [], scopes: [], variables: {} });
    });

    socket.on('session-error', (err: any) => {
      set({ error: err.error || 'Debugger session error' });
    });
  };

  return {
    activeSessionId: null,
    status: 'stopped',
    launchConfigs: [],
    activeConfig: null,
    breakpoints: [],
    callStack: [],
    activeFrameId: null,
    scopes: [],
    variables: {},
    watches: [],
    consoleLogs: [],
    loading: false,
    error: null,

    fetchLaunchConfigs: async (workspaceId) => {
      set({ loading: true, error: null });
      try {
        const res = await api.get(`/workspaces/${workspaceId}/debug/configs`);
        set({ launchConfigs: res.data, activeConfig: res.data[0] || null, loading: false });
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to fetch debug configurations', loading: false });
      }
    },

    saveLaunchConfig: async (workspaceId, config) => {
      try {
        const res = await api.post(`/workspaces/${workspaceId}/debug/configs`, config);
        const { launchConfigs } = get();
        const updated = config._id
          ? launchConfigs.map((c) => (c._id === config._id ? res.data : c))
          : [...launchConfigs, res.data];
        set({ launchConfigs: updated, activeConfig: res.data });
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to save configuration' });
      }
    },

    deleteLaunchConfig: async (workspaceId, configId) => {
      try {
        await api.delete(`/workspaces/${workspaceId}/debug/configs/${configId}`);
        set((state) => {
          const filtered = state.launchConfigs.filter((c) => c._id !== configId);
          return {
            launchConfigs: filtered,
            activeConfig: filtered[0] || null,
          };
        });
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to delete configuration' });
      }
    },

    setActiveConfig: (config) => {
      set({ activeConfig: config });
    },

    fetchBreakpoints: async (workspaceId) => {
      try {
        const res = await api.get(`/workspaces/${workspaceId}/debug/breakpoints`);
        set({ breakpoints: res.data });
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to fetch breakpoints' });
      }
    },

    toggleBreakpoint: async (workspaceId, filePath, line) => {
      const { breakpoints } = get();
      const existing = breakpoints.find((b) => b.filePath === filePath && b.line === line);
      
      let updatedBreakpoints: Breakpoint[];
      if (existing) {
        // Toggle enabled state
        updatedBreakpoints = breakpoints.map((b) =>
          b.filePath === filePath && b.line === line ? { ...b, enabled: !b.enabled } : b
        );
      } else {
        // Add new breakpoint
        updatedBreakpoints = [...breakpoints, { filePath, line, enabled: true }];
      }

      set({ breakpoints: updatedBreakpoints });

      // Save to database
      try {
        const fileBps = updatedBreakpoints.filter((b) => b.filePath === filePath);
        await api.post(`/workspaces/${workspaceId}/debug/breakpoints`, {
          filePath,
          breakpoints: fileBps,
        });
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to sync breakpoints' });
      }

      // Sync active session if running
      const { activeSessionId } = get();
      if (activeSessionId) {
        get().sendDAPRequest('setBreakpoints', {
          source: { path: filePath },
          breakpoints: updatedBreakpoints
            .filter(b => b.filePath === filePath && b.enabled)
            .map(b => ({
              line: b.line,
              condition: b.condition,
              logMessage: b.logMessage
            }))
        });
      }
    },

    addBreakpointDetails: async (workspaceId, filePath, line, condition, logMessage) => {
      const { breakpoints } = get();
      const updated = breakpoints.map((b) =>
        b.filePath === filePath && b.line === line ? { ...b, condition, logMessage } : b
      );
      set({ breakpoints: updated });

      try {
        const fileBps = updated.filter((b) => b.filePath === filePath);
        await api.post(`/workspaces/${workspaceId}/debug/breakpoints`, {
          filePath,
          breakpoints: fileBps,
        });
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to save breakpoint details' });
      }

      // Sync active session if running
      const { activeSessionId } = get();
      if (activeSessionId) {
        get().sendDAPRequest('setBreakpoints', {
          source: { path: filePath },
          breakpoints: updated
            .filter(b => b.filePath === filePath && b.enabled)
            .map(b => ({
              line: b.line,
              condition: b.condition,
              logMessage: b.logMessage
            }))
        });
      }
    },

    removeBreakpoint: async (workspaceId, filePath, line) => {
      const { breakpoints } = get();
      const filtered = breakpoints.filter((b) => !(b.filePath === filePath && b.line === line));
      set({ breakpoints: filtered });

      try {
        const fileBps = filtered.filter((b) => b.filePath === filePath);
        await api.post(`/workspaces/${workspaceId}/debug/breakpoints`, {
          filePath,
          breakpoints: fileBps,
        });
      } catch (err: any) {
        set({ error: err.response?.data?.error || 'Failed to delete breakpoint' });
      }
    },

    startDebugging: async (workspaceId) => {
      const { activeConfig, breakpoints } = get();
      if (!activeConfig) {
        set({ error: 'No launch configuration selected.' });
        return;
      }

      set({ loading: true, error: null, consoleLogs: [] });

      try {
        const newSessionId = `debug-${Math.random().toString(36).substring(2, 10)}`;
        const socket = getDebugSocket();

        if (!socket.connected) {
          socket.connect();
        }

        setupSocketListeners(newSessionId);

        // Handshake 1: Join socket room
        socket.emit('join', { sessionId: newSessionId });
        
        // Handshake 2: Start session
        socket.emit('start-session', {
          workspaceId,
          sessionId: newSessionId,
          adapterType: activeConfig.adapterType,
        });

        set({ activeSessionId: newSessionId, status: 'running', loading: false });

        // Handshake 3: Send DAP initialize
        setTimeout(() => {
          get().sendDAPRequest('initialize', {
            clientID: 'cloud-ide-client',
            adapterID: activeConfig.adapterType,
          });

          // Sync initial file breakpoints
          const fileGroups = new Map<string, Breakpoint[]>();
          for (const bp of breakpoints) {
            if (bp.enabled) {
              const list = fileGroups.get(bp.filePath) || [];
              list.push(bp);
              fileGroups.set(bp.filePath, list);
            }
          }

          for (const [filePath, bps] of fileGroups.entries()) {
            get().sendDAPRequest('setBreakpoints', {
              source: { path: filePath },
              breakpoints: bps.map((b) => ({
                line: b.line,
                condition: b.condition,
                logMessage: b.logMessage,
              })),
            });
          }

          // Launch program debuggee
          get().sendDAPRequest('launch', {
            program: activeConfig.program,
            args: activeConfig.args,
            env: activeConfig.env,
            mode: activeConfig.mode,
          });
        }, 800);

      } catch (err: any) {
        set({ error: 'Failed to start debug session', loading: false });
      }
    },

    stopDebugging: () => {
      const { activeSessionId } = get();
      if (activeSessionId) {
        const socket = getDebugSocket();
        socket.emit('close-session', { sessionId: activeSessionId });
        set({ activeSessionId: null, status: 'stopped', callStack: [], scopes: [], variables: {} });
      }
    },

    sendDAPRequest: (command, args = {}) => {
      const { activeSessionId } = get();
      if (!activeSessionId) return;

      const socket = getDebugSocket();
      socket.emit('dap:request', {
        sessionId: activeSessionId,
        message: {
          type: 'request',
          seq: seqCounter++,
          command,
          arguments: args,
        },
      });
    },

    selectFrame: async (frameId) => {
      set({ activeFrameId: frameId });
      // Fetch scopes for this selected frame
      get().sendDAPRequest('scopes', { frameId });
    },

    expandVariable: async (variablesReference) => {
      // Lazy load variables reference on tree expand
      get().sendDAPRequest('variables', { variablesReference });
    },

    addWatch: (expression) => {
      const { watches, activeSessionId } = get();
      if (watches.some((w) => w.expression === expression)) return;

      const newWatches = [...watches, { expression, value: '...' }];
      set({ watches: newWatches });

      if (activeSessionId) {
        const seq = seqCounter++;
        pendingEvaluations.set(seq, { type: 'watch', expression });
        const socket = getDebugSocket();
        socket.emit('dap:request', {
          sessionId: activeSessionId,
          message: {
            type: 'request',
            seq,
            command: 'evaluate',
            arguments: { expression, context: 'watch' }
          }
        });
      }
    },

    removeWatch: (expression) => {
      set((state) => ({
        watches: state.watches.filter((w) => w.expression !== expression),
      }));
    },

    evaluateREPL: async (expression) => {
      const { activeSessionId } = get();
      if (!activeSessionId) return;

      // Print input to console first
      set((state) => ({
        consoleLogs: [...state.consoleLogs, { category: 'console', text: `> ${expression}\n`, timestamp: new Date() }]
      }));

      const seq = seqCounter++;
      pendingEvaluations.set(seq, { type: 'repl', expression });
      const socket = getDebugSocket();
      socket.emit('dap:request', {
        sessionId: activeSessionId,
        message: {
          type: 'request',
          seq,
          command: 'evaluate',
          arguments: { expression, context: 'repl' }
        }
      });
    },

    setOrphanedBreakpoint: (filePath, line) => {
      set((state) => ({
        breakpoints: state.breakpoints.map((b) =>
          b.filePath === filePath && b.line === line ? { ...b, isOrphaned: true } : b
        )
      }));
    },

    resetStore: () => {
      set({
        activeSessionId: null,
        status: 'stopped',
        launchConfigs: [],
        activeConfig: null,
        breakpoints: [],
        callStack: [],
        activeFrameId: null,
        scopes: [],
        variables: {},
        watches: [],
        consoleLogs: [],
        loading: false,
        error: null,
      });
    },
  };
});
