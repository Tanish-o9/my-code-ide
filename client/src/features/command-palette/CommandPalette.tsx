import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '../../shared/stores/useUIStore';
import { useLayoutStore } from '../../shared/stores/useLayoutStore';
import { useEditorStore } from '../../shared/stores/useEditorStore';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { useExtensionStore } from '../../shared/stores/useExtensionStore';
import { useNavigationStore } from '../../shared/stores/useNavigationStore';
import { useDebugStore } from '../../shared/stores/useDebugStore';
import { useTerminalStore } from '../../shared/stores/useTerminalStore';
import { getTerminalSocket } from '../../shared/lib/socket';
import { api } from '../../shared/lib/api';
import { Terminal, Settings, Split, Layout, File, Loader2 } from 'lucide-react';

interface CommandPaletteProps {
  onClose: () => void;
  initialMode?: 'command' | 'file' | 'symbol';
}

interface CommandItem {
  id: string;
  name: string;
  category: string;
  icon: any;
  action: () => void | Promise<void>;
}

export default function CommandPalette({ onClose, initialMode = 'command' }: CommandPaletteProps) {
  const { activeWorkspace, setActiveWorkspace } = useWorkspaceStore();
  const { toggleTerminal, activePanel, setActivePanel } = useUIStore();
  const { splitPane, closePane, activePaneId } = useLayoutStore();
  const { saveTab, openTab } = useEditorStore();
  const contributedCommands = useExtensionStore((state) => state.contributedCommands);

  // Default query to > for command mode, @ for symbol, or empty for files
  const defaultQuery = initialMode === 'command' ? '>' : initialMode === 'symbol' ? '@' : '';
  const [query, setQuery] = useState(defaultQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Files search state
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Symbols outline state
  const [editorSymbols, setEditorSymbols] = useState<{ name: string; range: any }[]>([]);

  // Focus input and fetch files recursively if needed
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      // Position cursor at the end
      inputRef.current.setSelectionRange(query.length, query.length);
    }
  }, []);

  const fetchAllFilesRecursively = async (dirPath: string = ''): Promise<string[]> => {
    if (!activeWorkspace) return [];
    try {
      const response = await api.get(`/workspaces/${activeWorkspace._id}/files`, {
        params: { path: dirPath }
      });
      const nodes = response.data;
      let paths: string[] = [];
      for (const node of nodes) {
        if (node.type === 'file') {
          paths.push(node.path);
        } else {
          const subPaths = await fetchAllFilesRecursively(node.path);
          paths = [...paths, ...subPaths];
        }
      }
      return paths;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  // Load files when list is needed
  useEffect(() => {
    if (activeWorkspace) {
      const loadFiles = async () => {
        setIsLoadingFiles(true);
        const paths = await fetchAllFilesRecursively('');
        setFilePaths(paths);
        setIsLoadingFiles(false);
      };
      loadFiles();
    }
  }, [activeWorkspace]);

  // Extract symbols from the current active Monaco model
  useEffect(() => {
    const editor = (window as any).activeMonacoEditor;
    if (editor) {
      const model = editor.getModel();
      if (model) {
        const text = model.getValue();
        const lines = text.split('\n');
        const symbols: { name: string; range: any }[] = [];
        // Regex to parse classes, functions, const/let variables
        const classRegex = /(?:class|interface|function|const|let|var)\s+([a-zA-Z0-9_]+)/g;
        lines.forEach((line, idx) => {
          let match;
          classRegex.lastIndex = 0;
          match = classRegex.exec(line);
          if (match && match[1]) {
            symbols.push({
              name: match[1],
              range: { startLineNumber: idx + 1, startColumn: match.index + 1 }
            });
          }
        });
        setEditorSymbols(symbols);
      }
    }
  }, [query]);

  // Close palette if clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [onClose]);

  // List of all IDE commands
  const commands: CommandItem[] = [
    {
      id: 'help-welcome',
      name: 'Help: Welcome',
      category: 'Help',
      icon: Settings,
      action: () => {
        if (activeWorkspace) {
          useEditorStore.getState().openTab(activeWorkspace._id, 'welcome');
        }
      },
    },
    {
      id: 'help-show-commands',
      name: 'Help: Show All Commands',
      category: 'Help',
      icon: Settings,
      action: () => {
        // Already in command palette
      },
    },
    {
      id: 'help-playground',
      name: 'Help: Editor Playground',
      category: 'Help',
      icon: Settings,
      action: () => {
        if (activeWorkspace) {
          useEditorStore.getState().openTab(activeWorkspace._id, 'playground');
        }
      },
    },
    {
      id: 'help-walkthrough',
      name: 'Help: Walkthrough',
      category: 'Help',
      icon: Settings,
      action: () => {
        window.dispatchEvent(new CustomEvent('ide-command', { detail: { id: 'help-walkthrough' } }));
      },
    },
    {
      id: 'help-feedback',
      name: 'Help: Provide Feedback',
      category: 'Help',
      icon: Settings,
      action: () => {
        window.dispatchEvent(new CustomEvent('ide-command', { detail: { id: 'help-feedback' } }));
      },
    },
    {
      id: 'help-diagnostics',
      name: 'Help: Download Diagnostics',
      category: 'Help',
      icon: Settings,
      action: () => {
        window.dispatchEvent(new CustomEvent('ide-command', { detail: { id: 'help-diagnostics' } }));
      },
    },
    {
      id: 'help-license',
      name: 'Help: View License',
      category: 'Help',
      icon: Settings,
      action: () => {
        alert("MIT License\n\nCopyright (c) 2026 tanis\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software...");
      },
    },
    {
      id: 'help-devtools',
      name: 'Help: Toggle Developer Tools',
      category: 'Help',
      icon: Settings,
      action: () => {
        alert("Press F12 inside your web browser to toggle DevTools console.");
      },
    },
    {
      id: 'help-process',
      name: 'Help: Process Explorer',
      category: 'Help',
      icon: Settings,
      action: () => {
        window.dispatchEvent(new CustomEvent('ide-command', { detail: { id: 'help-process' } }));
      },
    },
    {
      id: 'help-updates',
      name: 'Help: Check for Updates',
      category: 'Help',
      icon: Settings,
      action: () => {
        alert("Check for updates: You are currently running the latest stable build (v1.0.0).");
      },
    },
    {
      id: 'help-about',
      name: 'Help: About',
      category: 'Help',
      icon: Settings,
      action: () => {
        window.dispatchEvent(new CustomEvent('ide-command', { detail: { id: 'help-about' } }));
      },
    },
    {
      id: 'python-select-interpreter',
      name: 'Python: Select Interpreter',
      category: 'Python',
      icon: Settings,
      action: () => {
        window.dispatchEvent(new CustomEvent('ide-command', { detail: { id: 'python-select-interpreter' } }));
      },
    },
    {
      id: 'python-run-file',
      name: 'Python: Run File',
      category: 'Python',
      icon: Settings,
      action: () => {
        window.dispatchEvent(new CustomEvent('ide-command', { detail: { id: 'python-run-file' } }));
      },
    },
    {
      id: 'python-create-venv',
      name: 'Python: Create Virtual Environment',
      category: 'Python',
      icon: Settings,
      action: () => {
        window.dispatchEvent(new CustomEvent('ide-command', { detail: { id: 'python-create-venv' } }));
      },
    },
    {
      id: 'terminal-new',
      name: 'Terminal: New Terminal',
      category: 'Terminal',
      icon: Terminal,
      action: () => {
        if (activeWorkspace) {
          useTerminalStore.getState().createTerminal(activeWorkspace._id);
          const uiStore = useUIStore.getState();
          if (!uiStore.terminalOpen) uiStore.toggleTerminal();
        }
      },
    },
    {
      id: 'terminal-split',
      name: 'Terminal: Split Terminal',
      category: 'Terminal',
      icon: Terminal,
      action: () => {
        if (activeWorkspace) {
          useTerminalStore.getState().createTerminal(activeWorkspace._id);
          const uiStore = useUIStore.getState();
          if (!uiStore.terminalOpen) uiStore.toggleTerminal();
        }
      },
    },
    {
      id: 'terminal-run-build-task',
      name: 'Terminal: Run Build Task',
      category: 'Terminal',
      icon: Terminal,
      action: () => {
        if (activeWorkspace) {
          const uiStore = useUIStore.getState();
          if (!uiStore.terminalOpen) uiStore.toggleTerminal();
          const termStore = useTerminalStore.getState();
          const buildCmd = 'npm run build';
          if (termStore.activeSessionId) {
            const socket = getTerminalSocket();
            socket.emit('input', { sessionId: termStore.activeSessionId, data: `${buildCmd}\n` });
          } else {
            termStore.createTerminal(activeWorkspace._id, buildCmd);
          }
        }
      },
    },
    {
      id: 'terminal-clear',
      name: 'Terminal: Clear',
      category: 'Terminal',
      icon: Terminal,
      action: () => {
        const termStore = useTerminalStore.getState();
        if (termStore.activeSessionId) {
          const socket = getTerminalSocket();
          socket.emit('input', { sessionId: termStore.activeSessionId, data: 'clear\n' });
        }
      },
    },
    {
      id: 'terminal-kill',
      name: 'Terminal: Kill Terminal',
      category: 'Terminal',
      icon: Terminal,
      action: () => {
        const termStore = useTerminalStore.getState();
        if (termStore.activeSessionId && activeWorkspace) {
          termStore.closeTerminal(activeWorkspace._id, termStore.activeSessionId);
        }
      },
    },
    {
      id: 'terminal-kill-all',
      name: 'Terminal: Kill All',
      category: 'Terminal',
      icon: Terminal,
      action: () => {
        const termStore = useTerminalStore.getState();
        if (activeWorkspace) {
          const sessionsCopy = [...termStore.sessions];
          for (const s of sessionsCopy) {
            termStore.closeTerminal(activeWorkspace._id, s.id);
          }
        }
      },
    },
    {
      id: 'run-start-debugging',
      name: 'Run: Start Debugging',
      category: 'Run',
      icon: Settings,
      action: () => {
        const debugStore = useDebugStore.getState();
        if (debugStore.activeSessionId) {
          debugStore.sendDAPRequest('continue');
        } else if (activeWorkspace) {
          debugStore.startDebugging(activeWorkspace._id);
          const uiStore = useUIStore.getState();
          uiStore.setActivePanel('debug');
          if (!uiStore.terminalOpen) uiStore.toggleTerminal();
        }
      },
    },
    {
      id: 'run-active-file',
      name: 'Run: Run File',
      category: 'Run',
      icon: Settings,
      action: () => {
        if ((window as any).handleRunActiveFile) {
          (window as any).handleRunActiveFile();
        } else {
          alert('Run feature is currently unavailable.');
        }
      },
    },
    {
      id: 'run-without-debugging',
      name: 'Run: Run Without Debugging',
      category: 'Run',
      icon: Settings,
      action: () => {
        if ((window as any).handleRunActiveFile) {
          (window as any).handleRunActiveFile();
        } else {
          alert('Run feature is currently unavailable.');
        }
      },
    },
    {
      id: 'run-stop-execution',
      name: 'Run: Stop Active File Execution',
      category: 'Run',
      icon: Settings,
      action: () => {
        if ((window as any).handleStopExecution) {
          (window as any).handleStopExecution();
        }
      },
    },
    {
      id: 'run-restart-execution',
      name: 'Run: Restart Active File Execution',
      category: 'Run',
      icon: Settings,
      action: () => {
        if ((window as any).handleRestartExecution) {
          (window as any).handleRestartExecution();
        }
      },
    },
    {
      id: 'run-stop-debugging',
      name: 'Run: Stop Debugging',
      category: 'Run',
      icon: Settings,
      action: () => {
        useDebugStore.getState().stopDebugging();
      },
    },
    {
      id: 'run-restart-debugging',
      name: 'Run: Restart Debugging',
      category: 'Run',
      icon: Settings,
      action: () => {
        const debugStore = useDebugStore.getState();
        debugStore.stopDebugging();
        if (activeWorkspace) {
          setTimeout(() => {
            debugStore.startDebugging(activeWorkspace._id);
          }, 500);
        }
      },
    },
    {
      id: 'run-step-over',
      name: 'Run: Step Over',
      category: 'Run',
      icon: Settings,
      action: () => {
        useDebugStore.getState().sendDAPRequest('next');
      },
    },
    {
      id: 'run-step-into',
      name: 'Run: Step Into',
      category: 'Run',
      icon: Settings,
      action: () => {
        useDebugStore.getState().sendDAPRequest('stepIn');
      },
    },
    {
      id: 'run-step-out',
      name: 'Run: Step Out',
      category: 'Run',
      icon: Settings,
      action: () => {
        useDebugStore.getState().sendDAPRequest('stepOut');
      },
    },
    {
      id: 'run-toggle-breakpoint',
      name: 'Run: Toggle Breakpoint',
      category: 'Run',
      icon: Settings,
      action: () => {
        const activeTab = (window as any).activeTabPath;
        const editor = (window as any).activeMonacoEditor;
        if (activeTab && editor && activeWorkspace) {
          const pos = editor.getPosition();
          if (pos) {
            useDebugStore.getState().toggleBreakpoint(activeWorkspace._id, activeTab, pos.lineNumber);
          }
        }
      },
    },
    {
      id: 'go-back',
      name: 'Go: Back',
      category: 'Go',
      icon: Settings,
      action: () => {
        const openTab = (path: string) => {
          if (activeWorkspace) {
            useEditorStore.getState().openTab(activeWorkspace._id, path);
          }
        };
        useNavigationStore.getState().goBack(openTab);
      },
    },
    {
      id: 'go-forward',
      name: 'Go: Forward',
      category: 'Go',
      icon: Settings,
      action: () => {
        const openTab = (path: string) => {
          if (activeWorkspace) {
            useEditorStore.getState().openTab(activeWorkspace._id, path);
          }
        };
        useNavigationStore.getState().goForward(openTab);
      },
    },
    {
      id: 'go-last-edit',
      name: 'Go: Last Edit Location',
      category: 'Go',
      icon: Settings,
      action: () => {
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
        }
      },
    },
    {
      id: 'go-to-line',
      name: 'Go: Go to Line',
      category: 'Go',
      icon: Settings,
      action: () => {
        const editor = (window as any).activeMonacoEditor;
        if (editor) {
          editor.focus();
          editor.getAction('editor.action.gotoLine')?.run();
        }
      },
    },
    {
      id: 'go-to-bracket',
      name: 'Go: Go to Bracket',
      category: 'Go',
      icon: Settings,
      action: () => {
        const editor = (window as any).activeMonacoEditor;
        if (editor) {
          editor.focus();
          editor.getAction('editor.action.jumpToBracket')?.run();
        }
      },
    },
    {
      id: 'go-to-definition',
      name: 'Go: Go to Definition',
      category: 'Go',
      icon: Settings,
      action: () => {
        const editor = (window as any).activeMonacoEditor;
        if (editor) {
          editor.focus();
          editor.getAction('editor.action.revealDefinition')?.run();
        }
      },
    },
    {
      id: 'go-to-references',
      name: 'Go: Go to References',
      category: 'Go',
      icon: Settings,
      action: () => {
        const editor = (window as any).activeMonacoEditor;
        if (editor) {
          editor.focus();
          editor.getAction('editor.action.goToReferences')?.run();
        }
      },
    },
    {
      id: 'toggle-sidebar',
      name: 'Toggle Side Panel',
      category: 'View',
      icon: Layout,
      action: () => setActivePanel(activePanel ? null : 'explorer'),
    },
    {
      id: 'open-explorer',
      name: 'Focus File Explorer',
      category: 'View',
      icon: File,
      action: () => setActivePanel('explorer'),
    },
    {
      id: 'open-search',
      name: 'Focus Global Search',
      category: 'View',
      icon: File,
      action: () => setActivePanel('search'),
    },
    {
      id: 'open-settings',
      name: 'Focus Settings Panel',
      category: 'View',
      icon: Settings,
      action: () => setActivePanel('settings'),
    },
    {
      id: 'toggle-terminal',
      name: 'Toggle Terminal Panel',
      category: 'View',
      icon: Terminal,
      action: () => toggleTerminal(),
    },
    {
      id: 'split-horizontal',
      name: 'Split Active Editor Horizontally',
      category: 'Editor',
      icon: Split,
      action: () => splitPane(activePaneId, 'horizontal'),
    },
    {
      id: 'split-vertical',
      name: 'Split Active Editor Vertically',
      category: 'Editor',
      icon: Split,
      action: () => splitPane(activePaneId, 'vertical'),
    },
    {
      id: 'close-pane',
      name: 'Close Active Pane Group',
      category: 'Editor',
      icon: Split,
      action: () => closePane(activePaneId),
    },
    {
      id: 'save-file',
      name: 'Save Active File (Ctrl+S)',
      category: 'File',
      icon: File,
      action: () => {
        if (activeWorkspace) {
          const activeTab = (window as any).activeTabPath;
          if (activeTab) {
            saveTab(activeWorkspace._id, activeTab);
          }
        }
      },
    },
    {
      id: 'theme-dark',
      name: 'Switch to Dark Theme',
      category: 'Preferences',
      icon: Settings,
      action: async () => {
        if (activeWorkspace) {
          const res = await api.patch(`/workspaces/${activeWorkspace._id}/settings`, {
            settings: { ...activeWorkspace.settings, theme: 'dark' },
          });
          setActiveWorkspace(res.data);
        }
      },
    },
    {
      id: 'theme-light',
      name: 'Switch to Light Theme',
      category: 'Preferences',
      icon: Settings,
      action: async () => {
        if (activeWorkspace) {
          const res = await api.patch(`/workspaces/${activeWorkspace._id}/settings`, {
            settings: { ...activeWorkspace.settings, theme: 'light' },
          });
          setActiveWorkspace(res.data);
        }
      },
    },
    {
      id: 'selection-select-all',
      name: 'Selection: Select All',
      category: 'Selection',
      icon: Settings,
      action: () => {
        const editor = (window as any).activeMonacoEditor;
        if (editor) {
          editor.focus();
          editor.getAction('editor.action.selectAll').run();
        }
      },
    },
    {
      id: 'selection-expand',
      name: 'Selection: Expand Selection',
      category: 'Selection',
      icon: Settings,
      action: () => {
        const editor = (window as any).activeMonacoEditor;
        if (editor) {
          editor.focus();
          editor.getAction('editor.action.smartSelect.expand').run();
        }
      },
    },
    {
      id: 'selection-shrink',
      name: 'Selection: Shrink Selection',
      category: 'Selection',
      icon: Settings,
      action: () => {
        const editor = (window as any).activeMonacoEditor;
        if (editor) {
          editor.focus();
          editor.getAction('editor.action.smartSelect.shrink').run();
        }
      },
    },
    {
      id: 'selection-cursor-above',
      name: 'Selection: Add Cursor Above',
      category: 'Selection',
      icon: Settings,
      action: () => {
        const editor = (window as any).activeMonacoEditor;
        if (editor) {
          editor.focus();
          editor.trigger('keyboard', 'editor.action.insertCursorAbove', null);
        }
      },
    },
    {
      id: 'selection-cursor-below',
      name: 'Selection: Add Cursor Below',
      category: 'Selection',
      icon: Settings,
      action: () => {
        const editor = (window as any).activeMonacoEditor;
        if (editor) {
          editor.focus();
          editor.trigger('keyboard', 'editor.action.insertCursorBelow', null);
        }
      },
    },
    {
      id: 'selection-column-mode',
      name: 'Selection: Toggle Column Selection Mode',
      category: 'Selection',
      icon: Settings,
      action: () => {
        const { columnSelectionMode, setColumnSelectionMode } = useUIStore.getState();
        setColumnSelectionMode(!columnSelectionMode);
      },
    },
    {
      id: 'selection-next-match',
      name: 'Selection: Add Next Occurrence',
      category: 'Selection',
      icon: Settings,
      action: () => {
        const editor = (window as any).activeMonacoEditor;
        if (editor) {
          editor.focus();
          editor.getAction('editor.action.addSelectionToNextFindMatch').run();
        }
      },
    },
    {
      id: 'view-toggle-menu-bar',
      name: 'View: Toggle Menu Bar',
      category: 'View',
      icon: Settings,
      action: () => {
        const { menuBarVisible, setMenuBarVisible } = useUIStore.getState();
        setMenuBarVisible(!menuBarVisible);
      },
    },
    {
      id: 'view-toggle-activity-bar',
      name: 'View: Toggle Activity Bar',
      category: 'View',
      icon: Settings,
      action: () => {
        const { activityBarVisible, setActivityBarVisible } = useUIStore.getState();
        setActivityBarVisible(!activityBarVisible);
      },
    },
    {
      id: 'view-toggle-sidebar',
      name: 'View: Toggle Side Bar',
      category: 'View',
      icon: Settings,
      action: () => {
        const { sidebarVisible, setSidebarVisible } = useUIStore.getState();
        setSidebarVisible(!sidebarVisible);
      },
    },
    {
      id: 'view-toggle-status-bar',
      name: 'View: Toggle Status Bar',
      category: 'View',
      icon: Settings,
      action: () => {
        const { statusBarVisible, setStatusBarVisible } = useUIStore.getState();
        setStatusBarVisible(!statusBarVisible);
      },
    },
    {
      id: 'view-toggle-minimap',
      name: 'View: Toggle Minimap',
      category: 'View',
      icon: Settings,
      action: () => {
        const { minimapVisible, setMinimapVisible } = useUIStore.getState();
        setMinimapVisible(!minimapVisible);
      },
    },
    {
      id: 'view-toggle-sticky-scroll',
      name: 'View: Toggle Sticky Scroll',
      category: 'View',
      icon: Settings,
      action: () => {
        const { stickyScrollVisible, setStickyScrollVisible } = useUIStore.getState();
        setStickyScrollVisible(!stickyScrollVisible);
      },
    },
    {
      id: 'view-toggle-zen-mode',
      name: 'View: Toggle Zen Mode',
      category: 'View',
      icon: Settings,
      action: () => {
        const { zenMode, setZenMode } = useUIStore.getState();
        setZenMode(!zenMode);
      },
    },
    {
      id: 'view-toggle-word-wrap',
      name: 'View: Toggle Word Wrap',
      category: 'View',
      icon: Settings,
      action: () => {
        const { wordWrapMode, setWordWrapMode } = useUIStore.getState();
        setWordWrapMode(wordWrapMode === 'on' ? 'off' : 'on');
      },
    },
    {
      id: 'view-split-right',
      name: 'View: Split Editor Right',
      category: 'View',
      icon: Settings,
      action: () => {
        const { activePaneId, splitPane } = useLayoutStore.getState();
        splitPane(activePaneId, 'horizontal');
      },
    },
    {
      id: 'view-split-down',
      name: 'View: Split Editor Down',
      category: 'View',
      icon: Settings,
      action: () => {
        const { activePaneId, splitPane } = useLayoutStore.getState();
        splitPane(activePaneId, 'vertical');
      },
    },
    {
      id: 'view-single-editor',
      name: 'View: Single Editor Layout',
      category: 'View',
      icon: Settings,
      action: () => {
        const { activePaneId } = useLayoutStore.getState();
        useLayoutStore.setState({
          layoutTree: { id: activePaneId || 'pane-1', type: 'leaf', openTabs: [], activeTab: null }
        });
      },
    },
    ...contributedCommands.map((cmd) => ({
      id: cmd.id,
      name: `Execute Command: ${cmd.id}`,
      category: 'Extension',
      icon: Terminal,
      action: async () => {
        try {
          const res = await useExtensionStore.getState().executeContributedCommand(cmd.extensionId, cmd.id);
          if (res && res.message) {
            alert(`Result: ${res.message}`);
          }
        } catch (err: any) {
          alert(`Command execution failed: ${err.message}`);
        }
      }
    }))
  ];

  // Determine current active mode
  const currentMode = query.startsWith('>') ? 'command' : query.startsWith('@') ? 'symbol' : 'file';

  // Process filters
  let filteredItems: { name: string; desc?: string; action: () => void }[] = [];

  if (currentMode === 'command') {
    const filterQuery = query.slice(1).trim();
    filteredItems = commands
      .filter((cmd) =>
        cmd.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
        cmd.category.toLowerCase().includes(filterQuery.toLowerCase())
      )
      .map((cmd) => ({
        name: cmd.name,
        desc: cmd.category,
        action: cmd.action,
      }));
  } else if (currentMode === 'symbol') {
    const filterQuery = query.slice(1).trim();
    filteredItems = editorSymbols
      .filter((sym) => sym.name.toLowerCase().includes(filterQuery.toLowerCase()))
      .map((sym) => ({
        name: sym.name,
        desc: `Line ${sym.range.startLineNumber}`,
        action: () => {
          const editor = (window as any).activeMonacoEditor;
          if (editor) {
            editor.setPosition(sym.range);
            editor.revealPositionInCenter(sym.range);
            editor.focus();
          }
        },
      }));
  } else {
    // File Search Mode
    filteredItems = filePaths
      .filter((filePath) => filePath.toLowerCase().includes(query.toLowerCase()))
      .map((filePath) => ({
        name: filePath.split('/').pop() || filePath,
        desc: filePath,
        action: () => {
          if (activeWorkspace) {
            openTab(activeWorkspace._id, filePath);
          }
        },
      }));
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-[10vh] backdrop-blur-[2px]">
      <div 
        ref={containerRef}
        className="w-[500px] bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-2xl flex flex-col overflow-hidden text-xs text-gray-300"
      >
        {/* Search header */}
        <div className="p-3 border-b border-[#3c3c3c] flex items-center space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              currentMode === 'command'
                ? "Type a command..."
                : currentMode === 'symbol'
                ? "Type a symbol name..."
                : "Search files by name..."
            }
            className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Dynamic Lists */}
        <div className="max-h-[300px] overflow-y-auto p-1">
          {isLoadingFiles && currentMode === 'file' ? (
            <div className="flex justify-center items-center py-6 text-gray-500 space-x-2">
              <Loader2 className="animate-spin" size={14} />
              <span>Indexing workspace files...</span>
            </div>
          ) : filteredItems.length > 0 ? (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={idx}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-600 text-white font-medium' : 'hover:bg-[#2d2d2d] text-gray-300'
                  }`}
                >
                  <span className="flex-1 truncate font-semibold">{item.name}</span>
                  {item.desc && (
                    <span className={`text-[10px] truncate max-w-[240px] px-1.5 py-0.5 rounded ${
                      isSelected ? 'text-blue-200' : 'text-gray-500'
                    }`}>
                      {item.desc}
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center text-gray-500 py-6 italic">No matches found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
