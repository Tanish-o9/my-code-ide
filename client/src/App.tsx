import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderTree,
  Search,
  GitBranch,
  Bot,
  Settings,
  Play,
  Sparkles,
  Cpu,
  CheckCircle,
  AlertTriangle,
  Send,
  X,
  LogOut,
  User as UserIcon,
  Loader2,
  Bug,
  Blocks,
  Square,
  RefreshCw,
  Terminal,
  FileCode,
  Layers
} from 'lucide-react';
import { useUIStore } from './shared/stores/useUIStore';
import { useAuthStore } from './shared/stores/useAuthStore';
import { useWorkspaceStore } from './shared/stores/useWorkspaceStore';
import { useEditorStore } from './shared/stores/useEditorStore';
import { useLayoutStore } from './shared/stores/useLayoutStore';
import { useFileTreeStore } from './shared/stores/useFileTreeStore';
import { api } from './shared/lib/api';
import LoginPage from './features/auth/LoginPage';
import RegisterPage from './features/auth/RegisterPage';
import WorkspaceDashboard from './features/workspace-dashboard/WorkspaceDashboard';
import FileExplorer from './features/file-explorer/FileExplorer';
import EditorArea from './features/editor/EditorArea';
import GlobalSearchPanel from './features/search/GlobalSearchPanel';
import SettingsPanel from './features/settings/SettingsPanel';
import CommandPalette from './features/command-palette/CommandPalette';
import TerminalPanel from './features/terminal/TerminalPanel';
import { useSessionRestore } from './shared/hooks/useSessionRestore';
import { useTerminalStore } from './shared/stores/useTerminalStore';
import AcceptInvite from './features/invites/AcceptInvite';
import { getCollabSocket, getTerminalSocket } from './shared/lib/socket';
import { usePresenceStore } from './shared/stores/usePresenceStore';
import { useCursorStore } from './shared/stores/useCursorStore';
import { useFollowStore } from './shared/stores/useFollowStore';
import SourceControlPanel from './features/source-control/SourceControlPanel';
import DebugPanel from './features/debug/DebugPanel';
import DebugToolbar from './features/debug/DebugToolbar';
import ExtensionsPanel from './features/extensions/ExtensionsPanel';
import { useExtensionStore } from './shared/stores/useExtensionStore';
import { useNavigationStore } from './shared/stores/useNavigationStore';
import { useDebugStore } from './shared/stores/useDebugStore';
import DockerPanel from './features/docker/DockerPanel';

export default function App() {
  const {
    activePanel,
    setActivePanel,
    terminalOpen,
    toggleTerminal,
    terminalHeight,
    setTerminalHeight,
    sidebarWidth,
    setSidebarWidth,
    aiPanelOpen,
    toggleAiPanel,
    aiPanelWidth,
    setAiPanelWidth,
    activityBarVisible,
    sidebarVisible,
    statusBarVisible,
    menuBarVisible,
    zenMode,
  } = useUIStore();

  const {
    user,
    isAuthenticated,
    login,
    logout
  } = useAuthStore();

  const [authPage, setAuthPage] = useState<'login' | 'register'>('login');
  const [isBooting, setIsBooting] = useState(true);
  const { activeWorkspace, setActiveWorkspace } = useWorkspaceStore();
  const { presentUsers } = usePresenceStore();
  const statusBarItems = useExtensionStore((state) => state.statusBarItems);
  const { followedUserId, followUser, unfollow } = useFollowStore();

  // Resize divider drag states
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingTerminal, setIsResizingTerminal] = useState(false);
  const [isResizingAiPanel, setIsResizingAiPanel] = useState(false);

  // Help Menu Modals States
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(0);
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'other'>('bug');
  const [feedbackText, setFeedbackText] = useState('');

  // Python Interpreter Picker states
  const [showPythonPicker, setShowPythonPicker] = useState(false);
  const [interpretersList, setInterpretersList] = useState<Array<{ name: string; version: string; path: string; type: string }>>([]);
  const [loadingInterpreters, setLoadingInterpreters] = useState(false);

  const [executionState, setExecutionState] = useState<{
    status: 'idle' | 'loading' | 'running' | 'completed' | 'failed';
    filePath: string | null;
    startTime: number | null;
    elapsedTime: number | null;
    exitCode: number | null;
    terminalSessionId: string | null;
  }>({
    status: 'idle',
    filePath: null,
    startTime: null,
    elapsedTime: null,
    exitCode: null,
    terminalSessionId: null
  });

  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  };

  const startTerminalResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingTerminal(true);
  };

  const startAiPanelResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingAiPanel(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        // Activity bar width is 48px (12rem/w-12)
        const newWidth = e.clientX - 48;
        if (newWidth > 160 && newWidth < 1000) {
          setSidebarWidth(newWidth);
        }
      }

      if (isResizingTerminal) {
        // Exclude bottom status bar (22px)
        const newHeight = window.innerHeight - e.clientY - 22;
        if (newHeight > 80 && newHeight < window.innerHeight - 150) {
          setTerminalHeight(newHeight);
        }
      }

      if (isResizingAiPanel) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 180 && newWidth < 800) {
          setAiPanelWidth(newWidth);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingTerminal(false);
      setIsResizingAiPanel(false);
    };

    if (isResizingSidebar || isResizingTerminal || isResizingAiPanel) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar, isResizingTerminal, isResizingAiPanel, setSidebarWidth, setTerminalHeight, setAiPanelWidth]);

  // Editor Zustand states
  const { saveTab } = useEditorStore();

  // Restore Session
  const { restoreSession } = useSessionRestore(activeWorkspace ? activeWorkspace._id : null);

  useEffect(() => {
    if (activeWorkspace) {
      restoreSession(activeWorkspace.session);
      useExtensionStore.getState().connectWorkspaceSocket(activeWorkspace._id);
      
      // Pre-warm the Docker sandbox container asynchronously in the background
      console.log(`[Workspace Pre-warm] Initiating pre-warm for workspace: ${activeWorkspace._id}`);
      api.post(`/workspaces/${activeWorkspace._id}/execution/prewarm`)
        .then(() => {
          console.log(`[Workspace Pre-warm] Pre-warm initiated successfully`);
        })
        .catch((err) => {
          console.warn(`[Workspace Pre-warm] Pre-warm failed to initiate:`, err);
        });
    } else {
      // Clear sessions and reset flags when closing workspace
      useTerminalStore.getState().resetStore();
    }
  }, [activeWorkspace]);

  // Listen to terminal socket exit events to update execution status reactively
  useEffect(() => {
    const socket = getTerminalSocket();

    const handleGlobalExit = (payload: { sessionId: string; exitCode?: number }) => {
      setExecutionState((prev) => {
        if (prev.terminalSessionId === payload.sessionId) {
          const elapsed = prev.startTime ? Date.now() - prev.startTime : 0;
          console.log(`[Run Execution] Session ${payload.sessionId} exited in ${elapsed}ms with code ${payload.exitCode ?? 0}`);
          return {
            ...prev,
            status: (payload.exitCode ?? 0) === 0 ? 'completed' : 'failed',
            exitCode: payload.exitCode ?? 0,
            elapsedTime: elapsed
          };
        }
        return prev;
      });
    };

    const handleGlobalSessionError = (payload: { sessionId: string; error: string }) => {
      setExecutionState((prev) => {
        if (prev.terminalSessionId === payload.sessionId) {
          return {
            ...prev,
            status: 'failed',
            exitCode: 1
          };
        }
        return prev;
      });
    };

    const handleConnect = () => {
      console.log('[Socket] Connected to Terminal server');
    };

    const handleDisconnect = (reason: string) => {
      console.warn('[Socket] Disconnected from Terminal server:', reason);
      setExecutionState((prev) => {
        if (prev.status === 'running' || prev.status === 'loading') {
          return {
            ...prev,
            status: 'failed',
            exitCode: -1,
            elapsedTime: prev.startTime ? Date.now() - prev.startTime : 0
          };
        }
        return prev;
      });
    };

    socket.on('exit', handleGlobalExit);
    socket.on('session-error', handleGlobalSessionError);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('exit', handleGlobalExit);
      socket.off('session-error', handleGlobalSessionError);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  // Hotkeys moved below to prevent temporal dead zone reference errors

  // AI Chat states
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant', text: string }>>([
    { role: 'assistant', text: 'Hello! I can help you refactor, write, and run code in this workspace. Ask me anything!' }
  ]);

  // Run Configuration Picker states
  const [configs, setConfigs] = useState<Array<{ _id: string; name: string; command: string }>>([]);
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  // Parse invite tokens from URL paths
  useEffect(() => {
    const match = window.location.pathname.match(/^\/accept-invite\/([a-f0-9]+)$/i);
    if (match) {
      setInviteToken(match[1]);
    }
  }, []);

  const refreshConfigs = async () => {
    if (activeWorkspace) {
      try {
        const res = await api.get(`/workspaces/${activeWorkspace._id}/runconfigs`);
        setConfigs(res.data);
        if (res.data.length > 0 && !res.data.some((c) => c._id === selectedConfigId)) {
          setSelectedConfigId(res.data[0]._id);
        }
      } catch (err) { }
    }
  };

  useEffect(() => {
    refreshConfigs();
  }, [activeWorkspace]);

  useEffect(() => {
    const handleIdeCommand = (e: Event) => {
      const customEvent = e as CustomEvent;
      const cmdId = customEvent.detail?.id;
      if (cmdId === 'help-walkthrough') {
        setWalkthroughStep(0);
        setShowWalkthrough(true);
      } else if (cmdId === 'help-feedback') {
        setShowFeedbackModal(true);
      } else if (cmdId === 'help-diagnostics') {
        handleDownloadDiagnostics();
      } else if (cmdId === 'help-process') {
        setShowProcessModal(true);
      } else if (cmdId === 'help-about') {
        setShowAboutModal(true);
      } else if (cmdId === 'python-select-interpreter') {
        handleOpenPythonPicker();
      } else if (cmdId === 'python-run-file') {
        handleRunPythonFile();
      } else if (cmdId === 'python-create-venv') {
        handleCreateVenv();
      }
    };
    window.addEventListener('ide-command', handleIdeCommand);
    return () => window.removeEventListener('ide-command', handleIdeCommand);
  }, [activeWorkspace]);

  // Connect to workspace presence room (Module 47)
  useEffect(() => {
    if (activeWorkspace) {
      const socket = getCollabSocket();
      if (!socket.connected) {
        socket.connect();
      }

      socket.emit('presence:join', { workspaceId: activeWorkspace._id });

      socket.on('presence:update', (data: { workspaceId: string; users: any[] }) => {
        if (data.workspaceId === activeWorkspace._id) {
          usePresenceStore.getState().setPresentUsers(data.users);
        }
      });

      socket.on('cursor:update', (data: any) => {
        if (data.position === null && data.selection === null) {
          useCursorStore.getState().removeCursor(data.userId);
        } else {
          useCursorStore.getState().updateCursor(data.userId, data);
        }
      });

      return () => {
        socket.off('presence:update');
        socket.off('cursor:update');
        usePresenceStore.getState().clearStore();
        useCursorStore.getState().clearCursors();
      };
    }
  }, [activeWorkspace]);

  const handleRunConfig = () => {
    const selected = configs.find((c) => c._id === selectedConfigId);
    if (selected && activeWorkspace) {
      if (!terminalOpen) {
        toggleTerminal();
      }
      useTerminalStore.getState().createTerminal(activeWorkspace._id, selected.command);
    } else {
      alert('Please add a Run configuration in Workspace Settings first.');
    }
  };

  // Command Palette state
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Listen for Command Palette & View & Go shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const openTab = (path: string) => {
        if (activeWorkspace) {
          useEditorStore.getState().openTab(activeWorkspace._id, path);
        }
      };

      const runMonacoAction = (actionId: string) => {
        const editor = (window as any).activeMonacoEditor;
        if (editor) {
          editor.focus();
          const action = editor.getAction(actionId);
          if (action) {
            action.run();
          }
        }
      };

      // Alt+Left Arrow: Go Back
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        useNavigationStore.getState().goBack(openTab);
      }
      // Alt+Right Arrow: Go Forward
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        useNavigationStore.getState().goForward(openTab);
      }
      // Ctrl+P: Go to File
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && !e.shiftKey) {
        e.preventDefault();
        (window as any).commandPaletteInitialMode = 'file';
        setCommandPaletteOpen(true);
      }
      // Ctrl+Shift+O: Go to Symbol in Editor
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        (window as any).commandPaletteInitialMode = 'symbol';
        setCommandPaletteOpen(true);
      }
      // Ctrl+G: Go to Line
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        runMonacoAction('editor.action.gotoLine');
      }
      // Ctrl+Shift+\: Go to Bracket
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '\\') {
        e.preventDefault();
        runMonacoAction('editor.action.jumpToBracket');
      }
      // F8: Next Problem
      if (e.key === 'F8' && !e.shiftKey) {
        e.preventDefault();
        runMonacoAction('editor.action.marker.next');
      }
      // Shift+F8: Previous Problem
      if (e.key === 'F8' && e.shiftKey) {
        e.preventDefault();
        runMonacoAction('editor.action.marker.prev');
      }
      // F12: Go to Definition
      if (e.key === 'F12' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        runMonacoAction('editor.action.revealDefinition');
      }
      // Shift+F12: Go to References
      if (e.key === 'F12' && e.shiftKey) {
        e.preventDefault();
        runMonacoAction('editor.action.goToReferences');
      }
      // Ctrl+F12: Go to Implementations
      if (e.key === 'F12' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        runMonacoAction('editor.action.goToImplementation');
      }

      // Ctrl+Shift+` : New Terminal
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '`') {
        e.preventDefault();
        if (activeWorkspace) {
          useTerminalStore.getState().createTerminal(activeWorkspace._id);
          const uiStore = useUIStore.getState();
          if (!uiStore.terminalOpen) uiStore.toggleTerminal();
        }
      }
      // Ctrl+Shift+B : Run Build Task
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (activeWorkspace) {
          if (!terminalOpen) toggleTerminal();
          const termStore = useTerminalStore.getState();
          const buildCmd = 'npm run build';
          if (termStore.activeSessionId) {
            const socket = getTerminalSocket();
            socket.emit('input', { sessionId: termStore.activeSessionId, data: `${buildCmd}\n` });
          } else {
            termStore.createTerminal(activeWorkspace._id, buildCmd);
          }
        }
      }
      // Ctrl+Shift+5 : Split Terminal
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '5') {
        e.preventDefault();
        if (activeWorkspace) {
          useTerminalStore.getState().createTerminal(activeWorkspace._id);
          const uiStore = useUIStore.getState();
          if (!uiStore.terminalOpen) uiStore.toggleTerminal();
        }
      }

      // F5: Start / Continue Debugging
      if (e.key === 'F5' && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        const debugStore = useDebugStore.getState();
        if (debugStore.activeSessionId) {
          debugStore.sendDAPRequest('continue');
        } else if (activeWorkspace) {
          debugStore.startDebugging(activeWorkspace._id);
          const uiStore = useUIStore.getState();
          uiStore.setActivePanel('debug');
          if (!uiStore.terminalOpen) uiStore.toggleTerminal();
        }
      }
      // Ctrl+F5: Run Without Debugging
      if ((e.ctrlKey || e.metaKey) && e.key === 'F5' && !e.shiftKey) {
        e.preventDefault();
        handleRunConfig();
      }
      // Shift+F5: Stop Debugging
      if (e.key === 'F5' && e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        useDebugStore.getState().stopDebugging();
      }
      // Ctrl+Shift+F5: Restart Debugging
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F5') {
        e.preventDefault();
        const debugStore = useDebugStore.getState();
        debugStore.stopDebugging();
        if (activeWorkspace) {
          setTimeout(() => {
            debugStore.startDebugging(activeWorkspace._id);
          }, 500);
        }
      }
      // F9: Toggle Breakpoint
      if (e.key === 'F9') {
        e.preventDefault();
        const activeTab = (window as any).activeTabPath;
        const editor = (window as any).activeMonacoEditor;
        if (activeTab && editor && activeWorkspace) {
          const pos = editor.getPosition();
          if (pos) {
            useDebugStore.getState().toggleBreakpoint(activeWorkspace._id, activeTab, pos.lineNumber);
          }
        }
      }
      // F10: Step Over
      if (e.key === 'F10') {
        e.preventDefault();
        useDebugStore.getState().sendDAPRequest('next');
      }
      // F11: Step Into
      if (e.key === 'F11' && !e.shiftKey) {
        e.preventDefault();
        useDebugStore.getState().sendDAPRequest('stepIn');
      }
      // Shift+F11: Step Out
      if (e.key === 'F11' && e.shiftKey) {
        e.preventDefault();
        useDebugStore.getState().sendDAPRequest('stepOut');
      }

      // Ctrl+Shift+P: Command Palette
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        (window as any).commandPaletteInitialMode = 'command';
        setCommandPaletteOpen(true);
      }
      // Ctrl+B: Toggle Sidebar
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        const { sidebarVisible, setSidebarVisible } = useUIStore.getState();
        setSidebarVisible(!sidebarVisible);
      }
      // Alt+Z: Word Wrap
      if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const { wordWrapMode, setWordWrapMode } = useUIStore.getState();
        setWordWrapMode(wordWrapMode === 'on' ? 'off' : 'on');
      }
      // Ctrl+`: Toggle Terminal
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        const { toggleTerminal } = useUIStore.getState();
        toggleTerminal();
      }
      // Ctrl+Shift+E: Explorer panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        const { setActivePanel } = useUIStore.getState();
        setActivePanel('explorer');
      }
      // Ctrl+Shift+F: Search panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const { setActivePanel } = useUIStore.getState();
        setActivePanel('search');
      }
      // Ctrl+Shift+G: Git panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        const { setActivePanel } = useUIStore.getState();
        setActivePanel('git');
      }
      // Ctrl+Shift+D: Run & Debug panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const { setActivePanel } = useUIStore.getState();
        setActivePanel('debug');
      }
      // Ctrl+Shift+X: Extensions panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        const { setActivePanel } = useUIStore.getState();
        setActivePanel('extensions');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeWorkspace]);

  // Boot: Check if user session is active (attempts silent token refresh via Axios interceptors)
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await api.get('/users/me');
        // If successful, save profile (Axios handled access token refresh under the hood)
        const currentToken = useAuthStore.getState().accessToken || '';
        login(response.data, currentToken);
      } catch (err) {
        // Safe to ignore on boot, user just needs to log in
      } finally {
        setIsBooting(false);
      }
    };
    checkSession();
  }, [login]);

  // Load initial welcome message once user is authenticated
  useEffect(() => {
    if (user) {
      setChatHistory([
        {
          role: 'assistant',
          text: `Welcome back, ${user.name}! I am your AI Workspace Agent. I have full read/write access to your sandbox workspace. How can I help you build today?`
        }
      ]);
    }
  }, [user]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim() || !activeWorkspace) return;

    const userMsg = chatMessage.trim();
    setChatMessage('');

    setChatHistory((prev) => [...prev, { role: 'user', text: userMsg }]);
    setChatHistory((prev) => [...prev, { role: 'assistant', text: 'Thinking...' }]);

    try {
      const formattedHistory = chatHistory.map((item) => ({
        role: item.role,
        content: item.text,
      }));

      const res = await api.post(`/workspaces/${activeWorkspace._id}/ai/chat`, {
        message: userMsg,
        history: formattedHistory,
      });

      const reply = res.data.reply;

      setChatHistory((prev) => {
        const copy = [...prev];
        if (copy.length > 0 && copy[copy.length - 1].text === 'Thinking...') {
          copy[copy.length - 1] = { role: 'assistant', text: reply };
        } else {
          copy.push({ role: 'assistant', text: reply });
        }
        return copy;
      });
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || 'AI chat failed.';
      setChatHistory((prev) => {
        const copy = [...prev];
        if (copy.length > 0 && copy[copy.length - 1].text === 'Thinking...') {
          copy[copy.length - 1] = { role: 'assistant', text: `Error: ${errMsg}` };
        } else {
          copy.push({ role: 'assistant', text: `Error: ${errMsg}` });
        }
        return copy;
      });
    }
  };



  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // File menu overlay prompt states
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [showRevertDialog, setShowRevertDialog] = useState(false);
  const [dialogInputText, setDialogInputText] = useState('');

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (activeDropdown && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activeDropdown]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Ctrl + N -> New Text File
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        useEditorStore.getState().createUntitledFile();
      }

      // 2. Ctrl + S -> Save File
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const { activeTab, saveTab } = useEditorStore.getState();
        if (activeTab && activeWorkspace) {
          if (activeTab.startsWith('Untitled-')) {
            setDialogInputText('');
            setShowSaveAsDialog(true);
          } else {
            saveTab(activeWorkspace._id, activeTab);
          }
        }
      }

      // 3. Ctrl + Shift + S -> Save As
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const { activeTab } = useEditorStore.getState();
        if (activeTab && activeWorkspace) {
          setDialogInputText(activeTab);
          setShowSaveAsDialog(true);
        }
      }

      // 4. Ctrl + Alt + O -> Open Folder
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        useWorkspaceStore.getState().setShowCreateModal(true);
        useWorkspaceStore.getState().setActiveWorkspace(null);
      }

      // 5. Ctrl + F4 -> Close Tab
      if (e.key === 'F4' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const { activeTab, closeTab } = useEditorStore.getState();
        if (activeTab) closeTab(activeTab);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeWorkspace]);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      logout();
    }
  };

  const handleOpenConfigurations = async () => {
    if (!activeWorkspace) return;
    const launchPath = '.vscode/launch.json';
    try {
      await api.get(`/workspaces/${activeWorkspace._id}/files/content`, {
        params: { path: launchPath }
      });
    } catch (err) {
      const defaultLaunchJson = {
        version: "0.2.0",
        configurations: [
          {
            name: "Launch Node.js Program",
            type: "node",
            request: "launch",
            program: "server/src/server.ts",
            args: [],
            env: {
              NODE_ENV: "development"
            }
          },
          {
            name: "Launch Python Script",
            type: "python",
            request: "launch",
            program: "main.py",
            args: [],
            env: {}
          }
        ]
      };
      await api.put(`/workspaces/${activeWorkspace._id}/files/content`, {
        path: launchPath,
        content: JSON.stringify(defaultLaunchJson, null, 2)
      });
      useFileTreeStore.getState().fetchDirectory(activeWorkspace._id, '');
    }

    useEditorStore.getState().openTab(activeWorkspace._id, launchPath);
  };



  const handleRunSelectedText = () => {
    const editor = (window as any).activeMonacoEditor;
    if (!editor || !activeWorkspace) {
      alert('No active editor.');
      return;
    }

    const selection = editor.getSelection();
    const model = editor.getModel();
    if (selection && model) {
      const selectedText = model.getValueInRange(selection);
      if (!selectedText.trim()) {
        alert('No text selected.');
        return;
      }

      if (!terminalOpen) {
        toggleTerminal();
      }

      const termStore = useTerminalStore.getState();
      if (termStore.activeSessionId) {
        const socket = getTerminalSocket();
        socket.emit('input', { sessionId: termStore.activeSessionId, data: `${selectedText}\n` });
      } else {
        termStore.createTerminal(activeWorkspace._id, selectedText);
      }
    }
  };

  const handleDownloadDiagnostics = () => {
    if (!activeWorkspace) return;
    const diagnosticsData = {
      system: {
        os: navigator.userAgent,
        platform: 'Web Client',
        version: '1.0.0',
      },
      workspace: {
        id: activeWorkspace._id,
        name: activeWorkspace.name,
        template: activeWorkspace.templateUsed,
      },
      settings: activeWorkspace.settings || {},
      logs: [
        '[Info] Application boot verified.',
        '[Info] Sandbox volume workspace verified.',
        '[Info] PTY terminal socket established.',
      ]
    };

    const blob = new Blob([JSON.stringify(diagnosticsData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagnostics-${activeWorkspace.name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenPythonPicker = async () => {
    if (!activeWorkspace) return;
    setShowPythonPicker(true);
    setLoadingInterpreters(true);
    try {
      const res = await api.get(`/workspaces/${activeWorkspace._id}/execution/python/detect`);
      setInterpretersList(res.data);
    } catch (err) {
      console.error('Failed to load interpreters:', err);
    } finally {
      setLoadingInterpreters(false);
    }
  };

  const handleSelectInterpreter = async (interpreterPath: string) => {
    if (!activeWorkspace) return;
    try {
      await api.post(`/workspaces/${activeWorkspace._id}/execution/python/interpreter`, {
        pythonPath: interpreterPath,
      });
      setActiveWorkspace({
        ...activeWorkspace,
        settings: {
          ...activeWorkspace.settings,
          pythonPath: interpreterPath,
        }
      });
      setShowPythonPicker(false);
      alert(`Selected Python interpreter: ${interpreterPath}`);
    } catch (err) {
      alert('Failed to select interpreter.');
    }
  };

  const handleCreateVenv = async () => {
    if (!activeWorkspace) return;
    try {
      const res = await api.post(`/workspaces/${activeWorkspace._id}/execution/python/venv/create`);
      const { command } = res.data;

      if (!terminalOpen) {
        toggleTerminal();
      }

      const termStore = useTerminalStore.getState();
      termStore.runCommandInTerminal(activeWorkspace._id, command);
      setShowPythonPicker(false);
    } catch (err) {
      alert('Failed to create virtual environment.');
    }
  };

  const handleRunPythonFile = () => {
    const activeTab = (window as any).activeTabPath || useEditorStore.getState().activeTab;
    if (!activeTab || !activeTab.endsWith('.py')) {
      alert('Active file is not a Python file.');
      return;
    }
    handleRunActiveFile();
  };

  // Relocated below handleRunActiveFile to prevent ReferenceError

  const handleRunActiveFile = useCallback(async () => {
    const timestamp = () => `[${new Date().toISOString()}]`;
    console.log(`${timestamp()} [Execution Pipeline] Step 1: Run button clicked`);

    try {
      let activeTab = (window as any).activeTabPath || useEditorStore.getState().activeTab;
      
      // Fallback: If no file is open, or active tab is a placeholder (like "welcome" or "playground")
      if (!activeTab || activeTab === 'welcome' || activeTab === 'playground' || activeTab.startsWith('Untitled-') || activeTab.startsWith('git-diff:')) {
        console.log(`${timestamp()} [Execution Pipeline] No active runnable file tab found, searching for fallbacks`);
        // 1. Try to find the first open tab that is a real file
        const openTabs = useEditorStore.getState().openTabs;
        const realTab = openTabs.find(t => !t.path.startsWith('Untitled-') && !t.path.startsWith('git-diff:') && t.path !== 'welcome' && t.path !== 'playground');
        if (realTab) {
          activeTab = realTab.path;
          console.log(`${timestamp()} [Execution Pipeline] Fallback found in open tabs: ${activeTab}`);
        } else {
          // 2. Scan the file tree root folder contents for any file
          const rootFiles = useFileTreeStore.getState().filesByFolder[''] || [];
          const firstFile = rootFiles.find(f => f.type === 'file');
          if (firstFile) {
            activeTab = firstFile.path;
            console.log(`${timestamp()} [Execution Pipeline] Fallback found in root files: ${activeTab}`);
          }
        }
      }

      if (!activeTab || !activeWorkspace) {
        alert('No active file open.');
        return;
      }

      if (activeTab.endsWith('.ipynb')) {
        alert('Please run cells inside the notebook editor directly.');
        return;
      }

      // Silently save unsaved changes before running to maintain auto-save alignment
      const { openTabs, saveTab } = useEditorStore.getState();
      const tab = openTabs.find((t) => t.path === activeTab);
      if (tab && tab.isDirty) {
        console.log(`${timestamp()} [Execution Pipeline] Active file "${activeTab}" is dirty, saving silently before run`);
        await saveTab(activeWorkspace._id, activeTab);
      }

      console.log(`${timestamp()} [Execution Pipeline] Step 2: Querying sandbox health/status`);
      let isWarm = false;
      let requestTimeout = 6000; // Default 6 seconds for warm start
      
      try {
        const statusRes = await api.get(`/workspaces/${activeWorkspace._id}/execution/status`);
        isWarm = statusRes.data.isRunning;
        if (!isWarm) {
          requestTimeout = 30000; // 30 seconds for cold start/creation
          console.log(`${timestamp()} [Execution Pipeline] Cold start detected. Setting timeout limit to 30s.`);
        } else {
          console.log(`${timestamp()} [Execution Pipeline] Warm start verified. Setting timeout limit to 6s.`);
        }
      } catch (e) {
        console.warn(`${timestamp()} [Execution Pipeline] Status query failed, defaulting to 10s timeout:`, e);
        requestTimeout = 10000;
      }

      console.log(`${timestamp()} [Execution Pipeline] Step 3: Setting UI status to loading`);
      setExecutionState({
        status: 'loading',
        filePath: activeTab,
        startTime: Date.now(),
        elapsedTime: null,
        exitCode: null,
        terminalSessionId: null
      });

      // Create an AbortController for the dynamic timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn(`${timestamp()} [Execution Pipeline] Step 4: Run request timed out (${requestTimeout}ms limit)`);
        controller.abort();
      }, requestTimeout);

      console.log(`${timestamp()} [Execution Pipeline] Step 5: Dispatching POST run command to backend`);

      try {
        const res = await api.post(`/workspaces/${activeWorkspace._id}/execution/run`, {
          filePath: activeTab
        }, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        console.log(`${timestamp()} [Execution Pipeline] Step 6: Received backend response`, res.data);
        const { runCommand, compileLog, staticPreview } = res.data;

        if (staticPreview) {
          console.log(`${timestamp()} [Execution Pipeline] Step 7: Layout static preview mode`);
          alert('Static preview started! File is served at port 3000.');
          setExecutionState((prev) => ({ ...prev, status: 'completed' }));
          return;
        }

        if (compileLog) {
          console.warn(`${timestamp()} [Execution Pipeline] Step 7: Target failed to compile`);
          setExecutionState((prev) => ({ ...prev, status: 'failed', exitCode: 1 }));
          if (!terminalOpen) {
            toggleTerminal();
          }
          const termStore = useTerminalStore.getState();
          const sessionId = termStore.createTerminal(activeWorkspace._id, `echo -e "\\x1b[1;31m[Compiler Error]\\x1b[0m\\n${compileLog.replace(/\r/g, '').replace(/\n/g, '\\n')}"`);
          return;
        }

        if (runCommand) {
          console.log(`${timestamp()} [Execution Pipeline] Step 7: Launching code execution inside PTY shell`);
          if (!terminalOpen) {
            toggleTerminal();
          }

          const termStore = useTerminalStore.getState();
          // Always spawn a fresh PTY terminal session to execute the command reliably
          const sessionId = termStore.createTerminal(activeWorkspace._id, runCommand);

          setExecutionState((prev) => ({
            ...prev,
            status: 'running',
            terminalSessionId: sessionId
          }));
          console.log(`${timestamp()} [Execution Pipeline] Step 8: Execution successfully started`);
        } else {
          throw new Error('Backend did not return a valid command to run.');
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        throw err;
      }
    } catch (err: any) {
      console.error(`${timestamp()} [Execution Pipeline] Step 9: Pipeline failure:`, err);
      
      const isTimeout = err.name === 'CanceledError' || err.name === 'AbortError' || err.code === 'ERR_CANCELED';
      let errMsg = '';
      if (isTimeout) {
        errMsg = 'Cold start container provisioning timed out (30s limit). Please check your Docker status and retry.';
      } else {
        errMsg = err.response?.data?.error || err.message || 'Failed to execute run request.';
      }
      
      setExecutionState((prev) => ({ ...prev, status: 'failed', exitCode: 1 }));
      alert(`Execution Error: ${errMsg}`);
    }
  }, [activeWorkspace, terminalOpen]);

  const handleStopExecution = useCallback(() => {
    if (!executionState.terminalSessionId) return;
    console.log(`[Run Execution] Stopping session: ${executionState.terminalSessionId}`);
    const socket = getTerminalSocket();
    socket.emit('close-session', { sessionId: executionState.terminalSessionId });
    setExecutionState((prev) => ({
      ...prev,
      status: 'idle',
      terminalSessionId: null
    }));
  }, [executionState.terminalSessionId]);

  const handleRestartExecution = useCallback(async () => {
    handleStopExecution();
    setTimeout(() => {
      handleRunActiveFile();
    }, 400);
  }, [handleStopExecution, handleRunActiveFile]);

  const handleRestartEngine = useCallback(async () => {
    if (!activeWorkspace) return;
    const timestamp = () => `[${new Date().toISOString()}]`;
    console.log(`${timestamp()} [Engine Restart] Force restarting sandbox for workspace: ${activeWorkspace._id}`);
    
    setExecutionState((prev) => ({ ...prev, status: 'loading' }));
    try {
      await api.post(`/workspaces/${activeWorkspace._id}/execution/restart-engine`);
      alert('Sandbox engine restarted successfully!');
      setExecutionState((prev) => ({ ...prev, status: 'idle' }));
    } catch (err: any) {
      console.error(`${timestamp()} [Engine Restart] Failed to restart sandbox:`, err);
      alert(`Restart Failed: ${err.response?.data?.error || err.message || 'Sandbox could not be restarted.'}`);
      setExecutionState((prev) => ({ ...prev, status: 'failed' }));
    }
  }, [activeWorkspace]);

  useEffect(() => {
    (window as any).handleRunActiveFile = handleRunActiveFile;
    (window as any).handleStopExecution = handleStopExecution;
    (window as any).handleRestartExecution = handleRestartExecution;
    (window as any).handleRestartEngine = handleRestartEngine;
  }, [executionState, activeWorkspace, terminalOpen, handleRunActiveFile, handleStopExecution, handleRestartExecution, handleRestartEngine]);

  // Listen for Ctrl+S / Ctrl+F5 / F5 keybinds
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeWorkspace) {
          // Helper: Find the active tab in the currently active pane
          const findActiveTabInPane = (node: any, paneId: string): string | null => {
            if (node.id === paneId && node.type === 'leaf') return node.activeTab;
            if (node.type === 'branch') {
              return findActiveTabInPane(node.children[0], paneId) || findActiveTabInPane(node.children[1], paneId);
            }
            return null;
          };

          const activeTabOfPane = findActiveTabInPane(
            useLayoutStore.getState().layoutTree,
            useLayoutStore.getState().activePaneId
          );

          if (activeTabOfPane) {
            saveTab(activeWorkspace._id, activeTabOfPane);
          }
        }
      }

      // Ctrl+F5 to Run Active File
      if ((e.ctrlKey || e.metaKey) && e.key === 'F5') {
        e.preventDefault();
        handleRunActiveFile();
      }

      // F5 to Start Debugging or Restart Active PTY execution
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.key === 'F5') {
        e.preventDefault();
        if (executionState.status === 'running') {
          handleRestartExecution();
        } else {
          const debugStore = useDebugStore.getState();
          if (debugStore.activeSessionId) {
            debugStore.sendDAPRequest('continue');
          } else if (activeWorkspace) {
            debugStore.startDebugging(activeWorkspace._id);
            const uiStore = useUIStore.getState();
            uiStore.setActivePanel('debug');
            if (!uiStore.terminalOpen) uiStore.toggleTerminal();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeWorkspace, saveTab, executionState, handleRunActiveFile, handleRestartExecution]);

  const handleNewFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !dialogInputText.trim()) return;

    try {
      const relPath = dialogInputText.trim();
      await useFileTreeStore.getState().createItem(activeWorkspace._id, relPath, 'file');
      await useEditorStore.getState().openTab(activeWorkspace._id, relPath);
      setShowNewFileDialog(false);
      setDialogInputText('');
    } catch (err) {
      alert('Failed to create file.');
    }
  };

  const handleSaveAsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { activeTab } = useEditorStore.getState();
    if (!activeWorkspace || !activeTab || !dialogInputText.trim()) return;

    try {
      const newPath = dialogInputText.trim();
      await useFileTreeStore.getState().renameItem(activeWorkspace._id, activeTab, newPath);
      await useEditorStore.getState().openTab(activeWorkspace._id, newPath);
      setShowSaveAsDialog(false);
      setDialogInputText('');
    } catch (err) {
      alert('Failed to save file.');
    }
  };

  const handleRevertConfirm = async () => {
    const { activeTab, updateTabContent } = useEditorStore.getState();
    if (!activeWorkspace || !activeTab) return;

    try {
      const res = await api.get(`/workspaces/${activeWorkspace._id}/files/content`, {
        params: { path: activeTab }
      });
      // Rollback editor content
      updateTabContent(activeWorkspace._id, activeTab, res.data.content);
      // Mark as clean
      useEditorStore.setState((state) => ({
        openTabs: state.openTabs.map((t) => t.path === activeTab ? { ...t, isDirty: false } : t)
      }));
      setShowRevertDialog(false);
    } catch (err) {
      alert('Failed to revert file contents.');
    }
  };
  // 1. Initial Boot Spinner
  if (isBooting) {
    return (
      <div className="flex flex-col justify-center items-center w-screen h-screen bg-[#121214] text-white">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-xs text-gray-400">Verifying security credentials & sandbox volumes...</p>
      </div>
    );
  }

  // Intercept render if visitor is visiting invite link (Module 46)
  if (inviteToken) {
    return (
      <AcceptInvite
        token={inviteToken}
        onComplete={() => {
          setInviteToken(null);
          window.history.pushState({}, '', '/');
        }}
      />
    );
  }

  // 2. Authentication Screen Gate
  if (!isAuthenticated || !user) {
    return authPage === 'login' ? (
      <LoginPage onSwitchToRegister={() => setAuthPage('register')} />
    ) : (
      <RegisterPage onSwitchToLogin={() => setAuthPage('login')} />
    );
  }

  // 3. Workspace Selection Gate (Dashboard)

  if (!activeWorkspace) {
    return <WorkspaceDashboard />;
  }

  if (activeWorkspace.containerStatus === 'provisioning') {
    return <WorkspaceProvisioningScreen workspace={activeWorkspace} />;
  }

  // 4. Authenticated IDE Application
  return (
    <div className="flex flex-col w-screen h-screen bg-[#1e1e1e] text-[#d4d4d4] overflow-hidden select-none">
      {/* Top Navbar */}
      {menuBarVisible && !zenMode && (
        <header className="flex items-center justify-between h-10 px-3 bg-[#2d2d2d] border-b border-[#3c3c3c] select-none">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
              <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              <span className="ml-3 font-semibold text-xs tracking-wider text-gray-400">My Code</span>
              <span className="text-gray-600 text-xs">/</span>
              <span className="text-gray-300 text-xs font-semibold">{activeWorkspace.name}</span>
            </div>

            {/* Top Menu Bar */}
            <div ref={dropdownRef} className="flex items-center space-x-3 text-xs text-gray-400 ml-4 font-normal select-none relative z-50">
              {['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help'].map((item) => (
                <div key={item} className="relative">
                  <span
                    onClick={() => setActiveDropdown(activeDropdown === item ? null : item)}
                    className={`hover:bg-[#3c3c3c] hover:text-white px-2 py-0.5 rounded cursor-pointer transition-colors block ${activeDropdown === item ? 'bg-[#3c3c3c] text-white font-medium' : ''
                      }`}
                  >
                    {item}
                  </span>

                  {/* Dropdown Options */}
                  {item === 'File' && activeDropdown === 'File' && (
                    <div className="absolute left-0 mt-1 w-64 bg-[#1c1c1f] border border-[#3c3c3c] rounded-lg shadow-2xl p-1 z-50 text-gray-300 animate-fadeIn font-normal">
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          useEditorStore.getState().createUntitledFile();
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>New Text File</span>
                        <span className="text-[10px] text-gray-500">Ctrl+N</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setDialogInputText('');
                          setShowNewFileDialog(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>New File...</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          useWorkspaceStore.getState().setShowCreateModal(true);
                          useWorkspaceStore.getState().setActiveWorkspace(null);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Open Folder...</span>
                        <span className="text-[10px] text-gray-500">Ctrl+K Ctrl+O</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const { activeTab } = useEditorStore.getState();
                          if (activeTab) {
                            if (activeTab.startsWith('Untitled-')) {
                              setDialogInputText('');
                              setShowSaveAsDialog(true);
                            } else {
                              useEditorStore.getState().saveTab(activeWorkspace._id, activeTab);
                            }
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Save</span>
                        <span className="text-[10px] text-gray-500">Ctrl+S</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const { activeTab } = useEditorStore.getState();
                          if (activeTab) {
                            setDialogInputText(activeTab);
                            setShowSaveAsDialog(true);
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Save As...</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+S</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const { openTabs, saveTab } = useEditorStore.getState();
                          openTabs.forEach(t => {
                            if (t.isDirty) saveTab(activeWorkspace._id, t.path);
                          });
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Save All</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          const { autoSave, setAutoSave } = useUIStore.getState();
                          setAutoSave(autoSave === 'afterDelay' ? 'off' : 'afterDelay');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Auto Save</span>
                        <span className="text-[10px] font-semibold text-blue-400">
                          {useUIStore.getState().autoSave === 'afterDelay' ? '✓ On' : 'Off'}
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const { activeTab } = useEditorStore.getState();
                          if (activeTab && !activeTab.startsWith('Untitled-')) {
                            setShowRevertDialog(true);
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Revert File</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const { activeTab, closeTab } = useEditorStore.getState();
                          if (activeTab) closeTab(activeTab);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Close Editor</span>
                        <span className="text-[10px] text-gray-500">Ctrl+F4</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          useWorkspaceStore.getState().setActiveWorkspace(null); // Close folder
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Close Folder</span>
                        <span className="text-[10px] text-gray-500">Ctrl+K F</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          handleLogout(); // Exit
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-red-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Exit</span>
                      </button>
                    </div>
                  )}

                  {item === 'Edit' && activeDropdown === 'Edit' && (
                    <div className="absolute left-0 mt-1 w-64 bg-[#1c1c1f] border border-[#3c3c3c] rounded-lg shadow-2xl p-1 z-50 text-gray-300 animate-fadeIn font-normal">
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.trigger('keyboard', 'undo', null);
                            editor.focus();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Undo</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Z</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.trigger('keyboard', 'redo', null);
                            editor.focus();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Redo</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Y</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            document.execCommand('cut');
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Cut</span>
                        <span className="text-[10px] text-gray-500">Ctrl+X</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            document.execCommand('copy');
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Copy</span>
                        <span className="text-[10px] text-gray-500">Ctrl+C</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            document.execCommand('paste');
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Paste</span>
                        <span className="text-[10px] text-gray-500">Ctrl+V</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('actions.find').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Find</span>
                        <span className="text-[10px] text-gray-500">Ctrl+F</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('actions.findWithReplace').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Replace</span>
                        <span className="text-[10px] text-gray-500">Ctrl+H</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          // Open Find in Files sidebar
                          useUIStore.getState().setActivePanel('search');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Find in Files</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+F</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.commentLine').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Toggle Line Comment</span>
                        <span className="text-[10px] text-gray-500">Ctrl+/</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.blockComment').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Toggle Block Comment</span>
                        <span className="text-[10px] text-gray-500">Shift+Alt+A</span>
                      </button>
                    </div>
                  )}

                  {item === 'Selection' && activeDropdown === 'Selection' && (
                    <div className="absolute left-0 mt-1 w-72 bg-[#1c1c1f] border border-[#3c3c3c] rounded-lg shadow-2xl p-1 z-50 text-gray-300 animate-fadeIn font-normal">
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.selectAll').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Select All</span>
                        <span className="text-[10px] text-gray-500">Ctrl+A</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.smartSelect.expand').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Expand Selection</span>
                        <span className="text-[10px] text-gray-500">Shift+Alt+→</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.smartSelect.shrink').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Shrink Selection</span>
                        <span className="text-[10px] text-gray-500">Shift+Alt+←</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.copyLinesUpAction').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Copy Line Up</span>
                        <span className="text-[10px] text-gray-500">Shift+Alt+↑</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.copyLinesDownAction').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Copy Line Down</span>
                        <span className="text-[10px] text-gray-500">Shift+Alt+↓</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.moveLinesUpAction').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Move Line Up</span>
                        <span className="text-[10px] text-gray-500">Alt+↑</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.moveLinesDownAction').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Move Line Down</span>
                        <span className="text-[10px] text-gray-500">Alt+↓</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.trigger('keyboard', 'editor.action.insertCursorAbove', null);
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Add Cursor Above</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Alt+↑</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.trigger('keyboard', 'editor.action.insertCursorBelow', null);
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Add Cursor Below</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Alt+↓</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.insertCursorAtEndOfEachLineSelected').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Add Cursors to Line Ends</span>
                        <span className="text-[10px] text-gray-500">Shift+Alt+I</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.addSelectionToNextFindMatch').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Add Next Occurrence</span>
                        <span className="text-[10px] text-gray-500">Ctrl+D</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.selectHighlights').run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Select All Occurrences</span>
                        <span className="text-[10px] text-gray-500">Ctrl+F2</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          const { multiCursorModifier, setMultiCursorModifier } = useUIStore.getState();
                          setMultiCursorModifier(multiCursorModifier === 'alt' ? 'ctrlCmd' : 'alt');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Switch to Ctrl+Click Multi-Cursor</span>
                        <span className="text-[10px] font-semibold text-blue-400">
                          {useUIStore.getState().multiCursorModifier === 'ctrlCmd' ? '✓ On' : 'Off'}
                        </span>
                      </button>

                      <button
                        onClick={() => {
                          const { columnSelectionMode, setColumnSelectionMode } = useUIStore.getState();
                          setColumnSelectionMode(!columnSelectionMode);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Column Selection Mode</span>
                        <span className="text-[10px] font-semibold text-blue-400">
                          {useUIStore.getState().columnSelectionMode ? '✓ On' : 'Off'}
                        </span>
                      </button>
                    </div>
                  )}

                  {item === 'View' && activeDropdown === 'View' && (
                    <div className="absolute left-0 mt-1 w-72 bg-[#1c1c1f] border border-[#3c3c3c] rounded-lg shadow-2xl p-1 z-50 text-gray-300 animate-fadeIn font-normal">
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setCommandPaletteOpen(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Command Palette...</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+P</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setActivePanel('explorer');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Explorer</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+E</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setActivePanel('search');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Search</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+F</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setActivePanel('git');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Source Control</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+G</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setActivePanel('debug');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Run & Debug</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+D</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setActivePanel('extensions');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Extensions</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+X</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          toggleTerminal();
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Terminal</span>
                        <span className="text-[10px] text-gray-500">Ctrl+`</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const { wordWrapMode, setWordWrapMode } = useUIStore.getState();
                          setWordWrapMode(wordWrapMode === 'on' ? 'off' : 'on');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer"
                      >
                        <span>Word Wrap</span>
                        <span className="text-[10px] text-gray-500">Alt+Z</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      {/* Appearance Options */}
                      <div className="px-2.5 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Appearance</div>

                      <button
                        onClick={() => {
                          const { menuBarVisible, setMenuBarVisible } = useUIStore.getState();
                          setMenuBarVisible(!menuBarVisible);
                        }}
                        className="w-full text-left px-2.5 py-1.2 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Toggle Menu Bar</span>
                        <span className="text-[10px] text-blue-400">{useUIStore.getState().menuBarVisible ? '✓' : ''}</span>
                      </button>

                      <button
                        onClick={() => {
                          const { activityBarVisible, setActivityBarVisible } = useUIStore.getState();
                          setActivityBarVisible(!activityBarVisible);
                        }}
                        className="w-full text-left px-2.5 py-1.2 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Toggle Activity Bar</span>
                        <span className="text-[10px] text-blue-400">{useUIStore.getState().activityBarVisible ? '✓' : ''}</span>
                      </button>

                      <button
                        onClick={() => {
                          const { sidebarVisible, setSidebarVisible } = useUIStore.getState();
                          setSidebarVisible(!sidebarVisible);
                        }}
                        className="w-full text-left px-2.5 py-1.2 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Toggle Side Bar</span>
                        <span className="text-[10px] text-blue-400">{useUIStore.getState().sidebarVisible ? '✓' : ''}</span>
                      </button>

                      <button
                        onClick={() => {
                          const { statusBarVisible, setStatusBarVisible } = useUIStore.getState();
                          setStatusBarVisible(!statusBarVisible);
                        }}
                        className="w-full text-left px-2.5 py-1.2 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Toggle Status Bar</span>
                        <span className="text-[10px] text-blue-400">{useUIStore.getState().statusBarVisible ? '✓' : ''}</span>
                      </button>

                      <button
                        onClick={() => {
                          const { minimapVisible, setMinimapVisible } = useUIStore.getState();
                          setMinimapVisible(!minimapVisible);
                        }}
                        className="w-full text-left px-2.5 py-1.2 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Toggle Minimap</span>
                        <span className="text-[10px] text-blue-400">{useUIStore.getState().minimapVisible ? '✓' : ''}</span>
                      </button>

                      <button
                        onClick={() => {
                          const { stickyScrollVisible, setStickyScrollVisible } = useUIStore.getState();
                          setStickyScrollVisible(!stickyScrollVisible);
                        }}
                        className="w-full text-left px-2.5 py-1.2 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Toggle Sticky Scroll</span>
                        <span className="text-[10px] text-blue-400">{useUIStore.getState().stickyScrollVisible ? '✓' : ''}</span>
                      </button>

                      <button
                        onClick={() => {
                          const { lineNumbersVisible, setLineNumbersVisible } = useUIStore.getState();
                          setLineNumbersVisible(!lineNumbersVisible);
                        }}
                        className="w-full text-left px-2.5 py-1.2 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Toggle Line Numbers</span>
                        <span className="text-[10px] text-blue-400">{useUIStore.getState().lineNumbersVisible ? '✓' : ''}</span>
                      </button>

                      <button
                        onClick={() => {
                          const { zenMode, setZenMode } = useUIStore.getState();
                          setZenMode(!zenMode);
                        }}
                        className="w-full text-left px-2.5 py-1.2 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Toggle Zen Mode</span>
                        <span className="text-[10px] text-blue-400">{useUIStore.getState().zenMode ? '✓' : ''}</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      {/* Editor Layout options */}
                      <div className="px-2.5 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Editor Layout</div>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const { activePaneId } = useLayoutStore.getState();
                          // Reset layout tree back to active leaf only (Single Editor)
                          useLayoutStore.setState({
                            layoutTree: { id: activePaneId || 'pane-1', type: 'leaf', openTabs: [], activeTab: null }
                          });
                        }}
                        className="w-full text-left px-2.5 py-1.2 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Single Editor</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const { activePaneId, splitPane } = useLayoutStore.getState();
                          splitPane(activePaneId, 'horizontal');
                        }}
                        className="w-full text-left px-2.5 py-1.2 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Split Right</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const { activePaneId, splitPane } = useLayoutStore.getState();
                          splitPane(activePaneId, 'vertical');
                        }}
                        className="w-full text-left px-2.5 py-1.2 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Split Down</span>
                      </button>
                    </div>
                  )}

                  {item === 'Go' && activeDropdown === 'Go' && (
                    <div className="absolute left-0 mt-1 w-72 bg-[#1c1c1f] border border-[#3c3c3c] rounded-lg shadow-2xl p-1 z-50 text-gray-300 animate-fadeIn font-normal">
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const openTab = (path: string) => {
                            if (activeWorkspace) {
                              useEditorStore.getState().openTab(activeWorkspace._id, path);
                            }
                          };
                          useNavigationStore.getState().goBack(openTab);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Back</span>
                        <span className="text-[10px] text-gray-500">Alt+Left Arrow</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const openTab = (path: string) => {
                            if (activeWorkspace) {
                              useEditorStore.getState().openTab(activeWorkspace._id, path);
                            }
                          };
                          useNavigationStore.getState().goForward(openTab);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Forward</span>
                        <span className="text-[10px] text-gray-500">Alt+Right Arrow</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const lastEdit = useNavigationStore.getState().lastEditLocation;
                          if (lastEdit && activeWorkspace) {
                            useEditorStore.getState().openTab(activeWorkspace._id, lastEdit.path);
                            setTimeout(() => {
                              const ed = (window as any).activeMonacoEditor;
                              if (ed) {
                                ed.setPosition({ lineNumber: lastEdit.lineNumber, column: lastEdit.column });
                                ed.revealPositionInCenter({ lineNumber: lastEdit.lineNumber, column: lastEdit.column });
                                ed.focus();
                              }
                            }, 80);
                          } else {
                            alert('No last edit location registered yet.');
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Last Edit Location</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Q</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          (window as any).commandPaletteInitialMode = 'file';
                          setCommandPaletteOpen(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Go to File...</span>
                        <span className="text-[10px] text-gray-500">Ctrl+P</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          (window as any).commandPaletteInitialMode = 'symbol';
                          setCommandPaletteOpen(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Go to Symbol in Editor...</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+O</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.revealDefinition')?.run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Go to Definition</span>
                        <span className="text-[10px] text-gray-500">F12</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.goToImplementation')?.run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Go to Implementations</span>
                        <span className="text-[10px] text-gray-500">Ctrl+F12</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.goToReferences')?.run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Go to References</span>
                        <span className="text-[10px] text-gray-500">Shift+F12</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.gotoLine')?.run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Go to Line/Column...</span>
                        <span className="text-[10px] text-gray-500">Ctrl+G</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.jumpToBracket')?.run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Go to Bracket</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+\</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.marker.next')?.run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Next Problem</span>
                        <span className="text-[10px] text-gray-500">F8</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const editor = (window as any).activeMonacoEditor;
                          if (editor) {
                            editor.focus();
                            editor.getAction('editor.action.marker.prev')?.run();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Previous Problem</span>
                        <span className="text-[10px] text-gray-500">Shift+F8</span>
                      </button>
                    </div>
                  )}

                  {item === 'Run' && activeDropdown === 'Run' && (
                    <div className="absolute left-0 mt-1 w-72 bg-[#1c1c1f] border border-[#3c3c3c] rounded-lg shadow-2xl p-1 z-50 text-gray-300 animate-fadeIn font-normal">
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const debugStore = useDebugStore.getState();
                          if (debugStore.activeSessionId) {
                            debugStore.sendDAPRequest('continue');
                          } else if (activeWorkspace) {
                            debugStore.startDebugging(activeWorkspace._id);
                            const uiStore = useUIStore.getState();
                            uiStore.setActivePanel('debug');
                            if (!uiStore.terminalOpen) uiStore.toggleTerminal();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Start Debugging</span>
                        <span className="text-[10px] text-gray-500">F5</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          handleRunConfig();
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Run Without Debugging</span>
                        <span className="text-[10px] text-gray-500">Ctrl+F5</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          useDebugStore.getState().stopDebugging();
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Stop Debugging</span>
                        <span className="text-[10px] text-gray-500">Shift+F5</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const debugStore = useDebugStore.getState();
                          debugStore.stopDebugging();
                          if (activeWorkspace) {
                            setTimeout(() => {
                              debugStore.startDebugging(activeWorkspace._id);
                            }, 500);
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Restart Debugging</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+F5</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          handleOpenConfigurations();
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Open Configurations</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          useDebugStore.getState().sendDAPRequest('next');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Step Over</span>
                        <span className="text-[10px] text-gray-500">F10</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          useDebugStore.getState().sendDAPRequest('stepIn');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Step Into</span>
                        <span className="text-[10px] text-gray-500">F11</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          useDebugStore.getState().sendDAPRequest('stepOut');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Step Out</span>
                        <span className="text-[10px] text-gray-500">Shift+F11</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const activeTab = (window as any).activeTabPath;
                          const editor = (window as any).activeMonacoEditor;
                          if (activeTab && editor && activeWorkspace) {
                            const pos = editor.getPosition();
                            if (pos) {
                              useDebugStore.getState().toggleBreakpoint(activeWorkspace._id, activeTab, pos.lineNumber);
                            }
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Toggle Breakpoint</span>
                        <span className="text-[10px] text-gray-500">F9</span>
                      </button>

                      <button
                        onClick={async () => {
                          setActiveDropdown(null);
                          if (activeWorkspace) {
                            // Clear all breakpoints
                            const bps = useDebugStore.getState().breakpoints;
                            for (const bp of bps) {
                              await useDebugStore.getState().removeBreakpoint(activeWorkspace._id, bp.filePath, bp.line);
                            }
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Remove All Breakpoints</span>
                      </button>
                    </div>
                  )}

                  {item === 'Terminal' && activeDropdown === 'Terminal' && (
                    <div className="absolute left-0 mt-1 w-72 bg-[#1c1c1f] border border-[#3c3c3c] rounded-lg shadow-2xl p-1 z-50 text-gray-300 animate-fadeIn font-normal">
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          if (activeWorkspace) {
                            useTerminalStore.getState().createTerminal(activeWorkspace._id);
                            const uiStore = useUIStore.getState();
                            if (!uiStore.terminalOpen) uiStore.toggleTerminal();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>New Terminal</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+`</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          if (activeWorkspace) {
                            useTerminalStore.getState().createTerminal(activeWorkspace._id);
                            const uiStore = useUIStore.getState();
                            if (!uiStore.terminalOpen) uiStore.toggleTerminal();
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Split Terminal</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+5</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          if (activeWorkspace) {
                            if (!terminalOpen) toggleTerminal();
                            const termStore = useTerminalStore.getState();
                            const buildCmd = 'npm run build';
                            if (termStore.activeSessionId) {
                              const socket = getTerminalSocket();
                              socket.emit('input', { sessionId: termStore.activeSessionId, data: `${buildCmd}\n` });
                            } else {
                              termStore.createTerminal(activeWorkspace._id, buildCmd);
                            }
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Run Build Task...</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+B</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          handleRunActiveFile();
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Run Active File</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          handleRunSelectedText();
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Run Selected Text</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          const termStore = useTerminalStore.getState();
                          if (termStore.activeSessionId) {
                            const socket = getTerminalSocket();
                            socket.emit('input', { sessionId: termStore.activeSessionId, data: 'clear\n' });
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Clear Terminal</span>
                      </button>
                    </div>
                  )}

                  {item === 'Help' && activeDropdown === 'Help' && (
                    <div className="absolute left-0 mt-1 w-64 bg-[#1c1c1f] border border-[#3c3c3c] rounded-lg shadow-2xl p-1 z-50 text-gray-300 animate-fadeIn font-normal">
                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          useEditorStore.getState().openTab(activeWorkspace._id, 'welcome');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Welcome</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setCommandPaletteOpen(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Show All Commands</span>
                        <span className="text-[10px] text-gray-500">Ctrl+Shift+P</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          useEditorStore.getState().openTab(activeWorkspace._id, 'playground');
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Editor Playground</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setWalkthroughStep(0);
                          setShowWalkthrough(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Open Walkthrough</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setShowFeedbackModal(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Provide Feedback</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          handleDownloadDiagnostics();
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Download Diagnostics</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          alert("MIT License\n\nCopyright (c) 2026 tanis\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software...");
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>View License</span>
                      </button>

                      <div className="h-[1px] bg-[#3c3c3c] my-1" />

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          alert("Press F12 inside your web browser to toggle DevTools console.");
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Toggle Developer Tools</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setShowProcessModal(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Open Process Explorer</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          alert("Check for updates: You are currently running the latest stable build (v1.0.0).");
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>Check for Updates...</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveDropdown(null);
                          setShowAboutModal(true);
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-blue-600 hover:text-white rounded flex justify-between items-center transition-colors cursor-pointer text-xs"
                      >
                        <span>About</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center px-4 py-1 rounded bg-[#1e1e1e] border border-[#3c3c3c] text-xs text-gray-400 w-96 justify-center space-x-2 cursor-pointer hover:bg-[#252526] transition-colors"
          >
            <Search size={12} />
            <span>Command Palette (Ctrl+Shift+P)</span>
          </div>

          <div className="flex items-center space-x-4 text-xs">
            {/* Avatar stack of present users (Module 47) */}
            <div className="flex items-center -space-x-1.5 overflow-hidden select-none mr-1">
              {presentUsers.map((pUser) => {
                const userName = pUser.name || 'Unknown User';
                const initials = userName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
                const isFollowing = followedUserId === pUser.userId;
                return (
                  <div
                    key={pUser.userId}
                    onClick={() => {
                      if (isFollowing) {
                        unfollow();
                      } else {
                        followUser(pUser.userId);
                      }
                    }}
                    style={{ backgroundColor: pUser.color }}
                    className={`w-6 h-6 rounded-full border border-[#2d2d2d] flex items-center justify-center text-[10px] font-bold text-white shadow-sm cursor-pointer transition-all ${isFollowing ? 'ring-2 ring-green-400 ring-offset-1 ring-offset-[#2d2d2d] scale-105' : 'hover:scale-105'
                      }`}
                    title={isFollowing ? `Following ${userName}. Click to unfollow.` : `Click to follow ${userName}`}
                  >
                    {initials}
                  </div>
                );
              })}
            </div>

            {/* Execution Controls Toolbar */}
            <div className="flex items-center space-x-1.5 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-1.5 py-0.5 shadow-sm">
              {executionState.status === 'running' ? (
                <>
                  <div className="flex items-center space-x-1 px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[9px] text-green-400 font-semibold uppercase tracking-wider">Running</span>
                  </div>
                  <button
                    onClick={handleRestartExecution}
                    className="p-1 hover:bg-[#333] rounded text-yellow-500 hover:text-yellow-400 transition-colors cursor-pointer flex items-center justify-center"
                    title="Restart Execution (F5)"
                  >
                    <RefreshCw size={11} />
                  </button>
                  <button
                    onClick={handleStopExecution}
                    className="p-1 hover:bg-[#333] rounded text-red-500 hover:text-red-400 transition-colors cursor-pointer flex items-center justify-center"
                    title="Stop Execution"
                  >
                    <Square size={11} fill="currentColor" />
                  </button>
                </>
              ) : executionState.status === 'loading' ? (
                <div className="flex items-center space-x-1 px-1.5 py-0.5">
                  <span className="w-2.5 h-2.5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[9px] text-gray-400 font-medium">Starting...</span>
                </div>
              ) : executionState.status === 'failed' ? (
                <button
                  onClick={handleRunActiveFile}
                  className="p-1.5 bg-red-700/20 hover:bg-red-700/30 border border-red-800/40 text-red-400 rounded transition-colors cursor-pointer shadow-sm flex items-center justify-center space-x-1 px-2.5"
                  title="Execution Failed. Click to Retry"
                >
                  <RefreshCw size={11} className="animate-pulse" />
                  <span className="text-[9px] font-semibold">Retry</span>
                </button>
              ) : (
                <button
                  onClick={handleRunActiveFile}
                  className="p-1.5 bg-green-700/20 hover:bg-green-700/30 border border-green-800/40 text-green-400 rounded transition-colors cursor-pointer shadow-sm flex items-center justify-center"
                  title="Run Active File (Ctrl+F5)"
                >
                  <Play size={12} fill="currentColor" />
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2 text-gray-300">
              <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                <UserIcon size={12} className="text-blue-400" />
              </div>
              <span className="font-semibold text-gray-300">{user.name}</span>
            </div>

            <button
              onClick={() => setActiveWorkspace(null)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#1e1e1e] hover:bg-[#252526] text-gray-400 border border-[#3c3c3c] transition-colors cursor-pointer"
              title="Exit Workspace"
            >
              <span>Back to Projects</span>
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-red-950/20 hover:bg-red-900/30 text-red-400 border border-red-900/30 transition-colors cursor-pointer"
              title="Log Out"
            >
              <LogOut size={12} />
              <span>Logout</span>
            </button>

            <button
              onClick={handleRestartEngine}
              disabled={executionState.status === 'loading'}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#1e1e1e] hover:bg-yellow-950/20 hover:text-yellow-400 border border-[#3c3c3c] hover:border-yellow-900/30 disabled:opacity-50 transition-colors cursor-pointer text-gray-400"
              title="Force restart the sandbox engine container"
            >
              <RefreshCw size={12} />
              <span>Restart Engine</span>
            </button>

            <button
              onClick={handleRunActiveFile}
              disabled={executionState.status === 'loading'}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:opacity-50 text-white transition-colors cursor-pointer"
              title="Run Active File (Ctrl+F5)"
            >
              {executionState.status === 'loading' ? (
                <>
                  <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                  <span>Starting...</span>
                </>
              ) : (
                <>
                  <Play size={12} />
                  <span>Run Project</span>
                </>
              )}
            </button>
          </div>
        </header>
      )}

      {/* Main Workspace Area */}
      <div className="flex flex-1 w-full overflow-hidden">

        {/* 1. Activity Bar (Leftmost) */}
        {activityBarVisible && !zenMode && (
          <div className="flex flex-col justify-between items-center w-12 bg-[#333333] border-r border-[#3c3c3c] py-2 flex-shrink-0">
            <div className="flex flex-col items-center w-full space-y-1">
              <ActivityButton
                icon={<FolderTree size={20} />}
                label="Explorer"
                active={activePanel === 'explorer'}
                onClick={() => setActivePanel('explorer')}
              />
              <ActivityButton
                icon={<Search size={20} />}
                label="Search"
                active={activePanel === 'search'}
                onClick={() => setActivePanel('search')}
              />
              <ActivityButton
                icon={<GitBranch size={20} />}
                label="Source Control"
                active={activePanel === 'git'}
                onClick={() => setActivePanel('git')}
              />
              <ActivityButton
                icon={<Bot size={20} />}
                label="AI Assistant"
                active={activePanel === 'ai'}
                onClick={() => setActivePanel('ai')}
              />
              <ActivityButton
                icon={<Bug size={20} />}
                label="Run & Debug"
                active={activePanel === 'debug'}
                onClick={() => setActivePanel('debug')}
              />
              <ActivityButton
                icon={<Blocks size={20} />}
                label="Extensions"
                active={activePanel === 'extensions'}
                onClick={() => setActivePanel('extensions')}
              />
              <ActivityButton
                icon={<Layers size={20} />}
                label="Docker"
                active={activePanel === 'docker'}
                onClick={() => setActivePanel('docker')}
              />
            </div>

            <div className="flex flex-col items-center w-full">
              <ActivityButton
                icon={<Settings size={20} />}
                label="Settings"
                active={activePanel === 'settings'}
                onClick={() => setActivePanel('settings')}
              />
            </div>
          </div>
        )}

        {/* 2. Collapsible Side Panel */}
        {activePanel && sidebarVisible && !zenMode && (
          <div
            className={`flex flex-col bg-[#252526] border-r border-[#3c3c3c] h-full flex-shrink-0 ${isResizingSidebar ? '' : 'transition-all'}`}
            style={{ width: `${sidebarWidth}px` }}
          >
            <div className="flex items-center justify-between p-3 border-b border-[#3c3c3c]">
              <span className="text-xs uppercase font-bold tracking-wider text-gray-400">{activePanel}</span>
              <button
                onClick={() => setActivePanel(null)}
                className="p-0.5 hover:bg-[#333333] rounded text-gray-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto text-sm">
              {activePanel === 'explorer' && <div className="p-2 h-full"><FileExplorer /></div>}
              {activePanel === 'search' && <div className="p-2 h-full"><GlobalSearchPanel /></div>}
              {activePanel === 'git' && <SourceControlPanel />}
              {activePanel === 'settings' && <div className="p-2 h-full"><SettingsPanel /></div>}
              {activePanel === 'debug' && <DebugPanel />}
              {activePanel === 'extensions' && <ExtensionsPanel />}
              {activePanel === 'ai' && <div className="text-xs text-gray-400 p-2">AI panel is docked on the right side for better usability.</div>}
              {activePanel === 'docker' && <DockerPanel />}
            </div>
          </div>
        )}

        {/* Sidebar Resize Handle */}
        {activePanel && sidebarVisible && !zenMode && (
          <div
            onMouseDown={startSidebarResize}
            className={`w-1 hover:w-1.5 cursor-col-resize h-full z-20 flex-shrink-0 transition-colors ${isResizingSidebar ? 'bg-blue-500 w-1.5' : 'bg-[#3c3c3c]/30 hover:bg-blue-500/50'
              }`}
          />
        )}

        {/* 3. Editor & Terminal Area (Center) */}
        <div className="flex flex-col flex-1 h-full bg-[#1e1e1e] overflow-hidden">

          {/* Editor Tabs & Workspace View */}
          <div className="flex-1 flex flex-col min-h-0">
            <EditorArea />
          </div>

          {/* Terminal Resize Handle */}
          {terminalOpen && (
            <div
              onMouseDown={startTerminalResize}
              className={`h-1 hover:h-1.5 cursor-row-resize w-full z-20 flex-shrink-0 transition-colors ${isResizingTerminal ? 'bg-blue-500 h-1.5' : 'bg-[#3c3c3c]/30 hover:bg-blue-500/50'
                }`}
            />
          )}

          {/* 4. Terminal Panel (Bottom) */}
          {terminalOpen && (
            <div
              className={`bg-[#1e1e1e] border-t border-[#3c3c3c] flex flex-col relative ${isResizingTerminal ? '' : 'transition-all'}`}
              style={{ height: `${terminalHeight}px` }}
            >
              <TerminalPanel />
            </div>
          )}
        </div>

        {/* AI Panel Resize Handle */}
        {aiPanelOpen && (
          <div
            onMouseDown={startAiPanelResize}
            className={`w-1 hover:w-1.5 cursor-col-resize h-full z-20 flex-shrink-0 transition-colors ${isResizingAiPanel ? 'bg-blue-500 w-1.5' : 'bg-[#3c3c3c]/30 hover:bg-blue-500/50'
              }`}
          />
        )}

        {/* 5. Right AI Assistant Panel */}
        {aiPanelOpen && (
          <div
            className={`flex flex-col bg-[#252526] border-l border-[#3c3c3c] h-full ${isResizingAiPanel ? '' : 'transition-all'}`}
            style={{ width: `${aiPanelWidth}px` }}
          >
            {/* AI Assistant Header */}
            <div className="flex items-center justify-between p-3 border-b border-[#3c3c3c] bg-[#2d2d2d]">
              <div className="flex items-center space-x-2 text-xs font-semibold text-purple-400">
                <Sparkles size={14} className="animate-pulse" />
                <span>AI ASSISTANT (ZUSTAND STORE)</span>
              </div>
              <button
                onClick={toggleAiPanel}
                className="p-0.5 hover:bg-[#333333] rounded text-gray-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
              {chatHistory.map((msg, index) => (
                <div
                  key={index}
                  className={`flex flex-col p-2.5 rounded-lg max-w-[90%] ${msg.role === 'user'
                      ? 'bg-blue-600/20 border border-blue-500/30 self-end ml-auto text-blue-200'
                      : 'bg-[#1e1e1e] border border-[#3c3c3c] self-start mr-auto text-gray-300'
                    }`}
                >
                  <span className="font-bold text-[10px] uppercase text-gray-500 mb-1">
                    {msg.role === 'user' ? 'You' : 'AI Agent'}
                  </span>
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-[#3c3c3c] bg-[#2d2d2d] flex items-center space-x-2">
              <input
                type="text"
                value={chatMessage}
                onChange={e => setChatMessage(e.target.value)}
                placeholder="Ask about workspace files, or ask to build a feature..."
                className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="submit"
                className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
              >
                <Send size={12} />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* 6. Status Bar */}
      {statusBarVisible && !zenMode && (
        <footer className="flex items-center justify-between h-[22px] px-3 bg-[#007acc] text-white text-[11px] select-none font-medium">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1 hover:bg-[#1f8ad2] px-1.5 py-0.5 cursor-pointer rounded">
              <GitBranch size={11} />
              <span>main</span>
            </span>
            <span className="flex items-center space-x-1 hover:bg-[#1f8ad2] px-1.5 py-0.5 cursor-pointer rounded">
              <CheckCircle size={11} />
              <span>0 errors</span>
            </span>
            <span className="flex items-center space-x-1 hover:bg-[#1f8ad2] px-1.5 py-0.5 cursor-pointer rounded">
              <AlertTriangle size={11} />
              <span>0 warnings</span>
            </span>
          </div>

          <div className="flex items-center space-x-4">
            {statusBarItems.map((item) => (
              <span
                key={item.id}
                title={item.tooltip}
                className="hover:bg-[#1f8ad2] px-1.5 py-0.5 cursor-pointer rounded font-mono font-semibold text-[10px]"
              >
                {item.text}
              </span>
            ))}
            {activeWorkspace && (
              <span
                onClick={handleOpenPythonPicker}
                className="hover:bg-[#1f8ad2] px-1.5 py-0.5 cursor-pointer rounded flex items-center space-x-1 font-mono text-[10px] text-green-400 font-bold"
                title="Select Python Interpreter (Click to change)"
              >
                <FileCode size={11} className="text-green-400" />
                <span>
                  {activeWorkspace.settings?.pythonPath
                    ? `Python: ${activeWorkspace.settings.pythonPath.split(/[\\/]/).pop()}`
                    : 'Select Python Interpreter'}
                </span>
              </span>
            )}
            <span className="hover:bg-[#1f8ad2] px-1.5 py-0.5 cursor-pointer rounded flex items-center space-x-1">
              <Cpu size={11} />
              <span>AI Provider: Gemini</span>
            </span>
            <span className="hover:bg-[#1f8ad2] px-1.5 py-0.5 cursor-pointer rounded">UTF-8</span>
            <span className="hover:bg-[#1f8ad2] px-1.5 py-0.5 cursor-pointer rounded">TypeScript JSX</span>
          </div>
        </footer>
      )}

      {commandPaletteOpen && (
        <CommandPalette
          initialMode={(window as any).commandPaletteInitialMode || 'command'}
          onClose={() => {
            setCommandPaletteOpen(false);
            (window as any).commandPaletteInitialMode = undefined;
          }}
        />
      )}
      <DebugToolbar />

      {/* New File Dialog */}
      {showNewFileDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-[#1c1c1f] border border-[#3c3c3c] rounded-xl shadow-2xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Create New File</h3>
            <form onSubmit={handleNewFileSubmit} className="space-y-4">
              <input
                type="text"
                value={dialogInputText}
                onChange={(e) => setDialogInputText(e.target.value)}
                placeholder="e.g. src/utils/math.ts"
                className="w-full bg-[#141416] border border-[#3c3c3c] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                required
                autoFocus
              />
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewFileDialog(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#3c3c3c] text-[10px] hover:bg-[#2d2d2d]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] font-semibold text-white cursor-pointer"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Save As Dialog */}
      {showSaveAsDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-[#1c1c1f] border border-[#3c3c3c] rounded-xl shadow-2xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Save File As</h3>
            <form onSubmit={handleSaveAsSubmit} className="space-y-4">
              <input
                type="text"
                value={dialogInputText}
                onChange={(e) => setDialogInputText(e.target.value)}
                placeholder="e.g. src/index.ts"
                className="w-full bg-[#141416] border border-[#3c3c3c] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                required
                autoFocus
              />
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowSaveAsDialog(false)}
                  className="px-3 py-1.5 rounded-lg border border-[#3c3c3c] text-[10px] hover:bg-[#2d2d2d]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] font-semibold text-white cursor-pointer"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revert Dialog */}
      {showRevertDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-[#1c1c1f] border border-[#3c3c3c] rounded-xl shadow-2xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Discard Unsaved Changes?</h3>
            <p className="text-[11px] text-gray-400 mb-4 leading-relaxed font-normal">
              Are you sure you want to revert all changes to this file? All local modifications will be permanently lost.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowRevertDialog(false)}
                className="px-3 py-1.5 rounded-lg border border-[#3c3c3c] text-[10px] hover:bg-[#2d2d2d]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevertConfirm}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-[10px] font-semibold text-white cursor-pointer"
              >
                Revert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About Modal */}
      {showAboutModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 font-sans select-none">
          <div className="bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4 text-xs text-gray-300">
            <div className="flex flex-col items-center text-center space-y-2 border-b border-[#2d2d2d] pb-4">
              <div className="w-12 h-12 rounded bg-blue-600/10 text-blue-400 flex items-center justify-center font-bold text-lg border border-blue-500/20">MC</div>
              <h2 className="text-sm font-bold text-white mt-1">My Code IDE</h2>
              <span className="text-[10px] text-gray-500">Version 1.0.0 (User Setup)</span>
            </div>
            <div className="space-y-1.5 font-mono text-[10px] bg-[#141414] p-3 rounded border border-[#2d2d2d]/60">
              <div className="flex justify-between"><span className="text-gray-500">Commit:</span> <span className="text-gray-300">a9c8f2b</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Date:</span> <span className="text-gray-300">{new Date().toISOString().split('T')[0]}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Electron:</span> <span className="text-gray-300">30.0.1</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Chrome:</span> <span className="text-gray-300">124.0.6367.243</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Node.js:</span> <span className="text-gray-300">20.11.1</span></div>
              <div className="flex justify-between"><span className="text-gray-500">OS:</span> <span className="text-gray-300">Windows_NT x64</span></div>
            </div>
            <div className="flex justify-end space-x-2 text-xs pt-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText("My Code IDE\nVersion: 1.0.0\nCommit: a9c8f2b\nElectron: 30.0.1\nOS: Windows_NT x64");
                  alert("Version info copied to clipboard!");
                }}
                className="px-3 py-1.5 hover:bg-[#2b2b2b] border border-[#3e3e3e] rounded text-gray-300 font-semibold"
              >
                Copy Info
              </button>
              <button
                onClick={() => setShowAboutModal(false)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 font-sans select-none">
          <div className="bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg shadow-xl w-full max-w-md p-5 space-y-4 text-xs text-gray-300">
            <h3 className="text-sm font-semibold text-white">Provide Feedback</h3>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Feedback Type</label>
              <div className="flex space-x-2">
                {['bug', 'feature', 'other'].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFeedbackType(t as any)}
                    className={`flex-1 py-1.5 rounded border text-center font-semibold transition-colors capitalize ${feedbackType === t
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                        : 'border-[#3e3e3e] text-gray-400 hover:text-white'
                      }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Comments</label>
              <textarea
                rows={3}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Tell us what you like or what needs to be fixed..."
                className="w-full bg-[#2a2a2b] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded p-2 text-xs text-gray-200 placeholder-gray-500 resize-none"
              />
            </div>
            <div className="flex justify-end space-x-2 text-xs pt-2">
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="px-3 py-1.5 hover:bg-[#2b2b2b] border border-[#3e3e3e] rounded text-gray-300 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert("Thank you for your feedback!");
                  setShowFeedbackModal(false);
                  setFeedbackText('');
                }}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white font-semibold"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Process Explorer Modal */}
      {showProcessModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 font-sans select-none">
          <div className="bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg shadow-xl w-full max-w-lg p-5 space-y-4 text-xs text-gray-300">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Process Explorer</h3>
              <button onClick={() => setShowProcessModal(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-mono border-collapse">
                <thead>
                  <tr className="border-b border-[#2d2d2d] text-gray-500">
                    <th className="pb-2">PID</th>
                    <th className="pb-2">Process Name</th>
                    <th className="pb-2">CPU</th>
                    <th className="pb-2">Memory</th>
                    <th className="pb-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2d2d2d]/40">
                  {[
                    { pid: 1420, name: 'Main Process (Electron shell)', cpu: '0.4%', mem: '45 MB' },
                    { pid: 8832, name: 'Renderer (Vite client UI)', cpu: '1.2%', mem: '128 MB' },
                    { pid: 9112, name: 'Node PTY Adapter (Terminal)', cpu: '0.0%', mem: '14 MB' },
                    { pid: 3450, name: 'DAP Debug Adapter Server', cpu: '0.0%', mem: '22 MB' },
                  ].map((p) => (
                    <tr key={p.pid} className="hover:bg-[#252526]">
                      <td className="py-2 text-gray-500">{p.pid}</td>
                      <td className="py-2 text-gray-200">{p.name}</td>
                      <td className="py-2 text-blue-400">{p.cpu}</td>
                      <td className="py-2 text-gray-400">{p.mem}</td>
                      <td className="py-2">
                        <button
                          onClick={() => alert(`Terminated PID ${p.pid}`)}
                          className="text-red-400 hover:underline"
                        >
                          Kill
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Walkthrough Wizard Overlay */}
      {showWalkthrough && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 font-sans select-none">
          <div className="bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg shadow-xl w-full max-w-md p-6 space-y-4 text-xs text-gray-300">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-white uppercase text-[10px] tracking-wider text-blue-400">Step {walkthroughStep + 1} of 3</span>
              <button onClick={() => setShowWalkthrough(false)} className="text-gray-500 hover:text-white">✕</button>
            </div>
            {walkthroughStep === 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-white">Welcome to the Workspace</h3>
                <p className="text-gray-400 leading-relaxed">
                  The sidebar explorer contains folders and files mapping directly to your docker sandboxed environment.
                </p>
              </div>
            )}
            {walkthroughStep === 1 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-white">Monaco Code Editor</h3>
                <p className="text-gray-400 leading-relaxed">
                  Write code with full autocomplete, syntax checkers, breakpoints, and inline git blame tooltips.
                </p>
              </div>
            )}
            {walkthroughStep === 2 && (
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-white">Integrated PTY Terminal</h3>
                <p className="text-gray-400 leading-relaxed">
                  Run shell scripts, execute tasks, build packages, and run projects within a real split-pane shell.
                </p>
              </div>
            )}
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => setShowWalkthrough(false)}
                className="text-gray-500 hover:underline"
              >
                Skip Onboarding
              </button>
              <div className="flex space-x-2">
                {walkthroughStep > 0 && (
                  <button
                    onClick={() => setWalkthroughStep(walkthroughStep - 1)}
                    className="px-3 py-1.5 hover:bg-[#2b2b2b] border border-[#3e3e3e] rounded text-gray-300 font-semibold"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={() => {
                    if (walkthroughStep < 2) {
                      setWalkthroughStep(walkthroughStep + 1);
                    } else {
                      setShowWalkthrough(false);
                      setWalkthroughStep(0);
                    }
                  }}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white font-semibold"
                >
                  {walkthroughStep === 2 ? 'Done' : 'Next'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Python Interpreter Picker Dialog */}
      {showPythonPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 font-sans select-none">
          <div className="bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg shadow-xl w-full max-w-md p-5 space-y-4 text-xs text-gray-300">
            <div className="flex justify-between items-center border-b border-[#2d2d2d] pb-2">
              <h3 className="text-sm font-semibold text-white">Select Python Interpreter</h3>
              <button onClick={() => setShowPythonPicker(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Detected System & Virtual Environments</span>
                <button
                  onClick={handleCreateVenv}
                  className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-400 rounded text-[10px] font-semibold transition-colors"
                >
                  Create .venv...
                </button>
              </div>

              {loadingInterpreters ? (
                <div className="p-6 text-center text-gray-500">
                  <div className="w-4 h-4 border-2 border-t-blue-500 border-blue-500/10 rounded-full animate-spin mx-auto mb-2"></div>
                  <span>Scanning for Python installations...</span>
                </div>
              ) : interpretersList.length === 0 ? (
                <div className="p-4 text-center text-gray-500 border border-[#2d2d2d] rounded bg-[#252526]/20 italic">
                  No python interpreters detected on this system.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {interpretersList.map((int, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleSelectInterpreter(int.path)}
                      className={`p-2.5 bg-[#252526] hover:bg-[#2d2d2e] border rounded cursor-pointer transition-colors flex items-center justify-between ${activeWorkspace?.settings?.pythonPath === int.path
                          ? 'border-blue-500 text-white'
                          : 'border-[#2d2d2d]/60 text-gray-300'
                        }`}
                    >
                      <div>
                        <div className="font-semibold">{int.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono mt-0.5">{int.path}</div>
                      </div>
                      <span className="text-[9px] font-mono bg-[#1c1c1f] border border-[#2d2d2d] px-1.5 py-0.5 rounded text-gray-400">
                        {int.version.split(' ')[1] || int.version}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual Interpreter Input */}
              <div className="space-y-1 pt-2 border-t border-[#2d2d2d]">
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Manual Python Path</label>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const input = form.elements.namedItem('customPath') as HTMLInputElement;
                    if (input.value.trim()) handleSelectInterpreter(input.value.trim());
                  }}
                  className="flex space-x-2"
                >
                  <input
                    name="customPath"
                    type="text"
                    defaultValue={activeWorkspace?.settings?.pythonPath || ''}
                    placeholder="e.g. /usr/bin/python3 or C:\Python39\python.exe..."
                    className="flex-1 bg-[#2a2a2b] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold transition-colors"
                  >
                    Select
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ActivityButtonProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function ActivityButton({ icon, label, active, onClick }: ActivityButtonProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative flex items-center justify-center w-full h-12 transition-colors ${active
          ? 'text-white border-l-2 border-l-blue-500 bg-[#252526]'
          : 'text-gray-400 hover:text-white hover:bg-[#2d2d2d]'
        }`}
    >
      {icon}
    </button>
  );
}

// Workspace Async Provisioning Loader Screen (Module 68)
function WorkspaceProvisioningScreen({ workspace }: { workspace: any }) {
  const { setActiveWorkspace } = useWorkspaceStore();
  const [dots, setDots] = useState('');

  useEffect(() => {
    const dotsInterval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);

    const pollInterval = setInterval(async () => {
      try {
        const res = await api.get(`/workspaces/${workspace._id}`);
        if (res.data.containerStatus !== 'provisioning') {
          setActiveWorkspace(res.data);
        }
      } catch (err) {
        console.error('Failed to poll workspace status:', err);
      }
    }, 2000);

    return () => {
      clearInterval(dotsInterval);
      clearInterval(pollInterval);
    };
  }, [workspace, setActiveWorkspace]);

  return (
    <div className="flex flex-col items-center justify-center w-screen h-screen bg-[#121214] text-white space-y-4">
      <div className="w-10 h-10 border-4 border-t-blue-500 border-blue-500/10 rounded-full animate-spin"></div>
      <div className="flex flex-col items-center text-center space-y-1.5 p-4 max-w-sm">
        <h3 className="font-bold text-sm text-gray-200">Provisioning Workspace Sandbox{dots}</h3>
        <p className="text-xs text-gray-500">
          We are setting up your workspace files directory, allocating network ports, and cloning any git repository templates. This might take a few moments.
        </p>
      </div>
    </div>
  );
}

// End of file
