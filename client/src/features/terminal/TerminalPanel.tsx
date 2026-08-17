import { useEffect, useRef, useState } from 'react';
import { api } from '../../shared/lib/api';
import { useTerminalStore } from '../../shared/stores/useTerminalStore';
import type { TerminalTab } from '../../shared/stores/useTerminalStore';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { getTerminalSocket } from '../../shared/lib/socket';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { 
  Plus, 
  X, 
  Terminal as TermIcon, 
  Edit2, 
  Check,
  Cpu,
  AlertCircle,
  Play,
  FlaskConical,
  FileCode,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import ProcessPanel from './ProcessPanel';
import DebugConsole from '../debug/DebugConsole';
import ProblemsPanel from './ProblemsPanel';
import TasksPanel from './TasksPanel';
import TestExplorerPanel from './TestExplorerPanel';
import UserSnippetsPanel from './UserSnippetsPanel';

import 'xterm/css/xterm.css';

export default function TerminalPanel() {
  const { activeWorkspace } = useWorkspaceStore();
  const { 
    sessions, 
    activeSessionId, 
    createTerminal, 
    closeTerminal, 
    setActiveSession,
    renameTerminal
  } = useTerminalStore();

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [activeTabType, setActiveTabType] = useState<'terminals' | 'processes' | 'console' | 'problems' | 'tasks' | 'tests' | 'snippets'>('terminals');

  // Auto-focus Terminals tab when active terminal session updates
  useEffect(() => {
    if (activeSessionId) {
      setActiveTabType('terminals');
    }
  }, [activeSessionId]);

  // AI Terminal States
  const [aiPrompt, setAiPrompt] = useState('');
  const [translatedCommand, setTranslatedCommand] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(false);
  const [loadingTranslation, setLoadingTranslation] = useState(false);
  
  // Failure diagnosis states
  const [failedSessionId, setFailedSessionId] = useState<string | null>(null);
  const [failedCommand, setFailedCommand] = useState<string>('');
  const [failedOutput, setFailedOutput] = useState<string>('');
  const [aiDiagnosis, setAiDiagnosis] = useState<string | null>(null);
  const [loadingDiagnosis, setLoadingDiagnosis] = useState(false);

  // Monitor terminal failures
  useEffect(() => {
    const handleFailureEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { sessionId, exitCode } = customEvent.detail;
      setFailedSessionId(sessionId);
      setFailedCommand('Executed task/script command');
      setFailedOutput(`Exit code: ${exitCode}. Check terminal logs.`);
    };

    window.addEventListener('terminal-failure', handleFailureEvent);
    return () => {
      window.removeEventListener('terminal-failure', handleFailureEvent);
    };
  }, []);

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim() || !activeSessionId) return;

    setLoadingTranslation(true);
    setTranslatedCommand(null);
    try {
      const res = await api.post(`/workspaces/${activeWorkspace._id}/terminal-ai/translate`, {
        prompt: aiPrompt
      });
      const cmd = res.data.command;
      if (autoRun) {
        const socket = getTerminalSocket();
        socket.emit('input', { sessionId: activeSessionId, data: `${cmd}\n` });
        setAiPrompt('');
      } else {
        setTranslatedCommand(cmd);
      }
    } catch (err: any) {
      alert(`AI Translation failed: ${err.message || err}`);
    } finally {
      setLoadingTranslation(false);
    }
  };

  const executeCommand = () => {
    if (!translatedCommand || !activeSessionId) return;
    const socket = getTerminalSocket();
    socket.emit('input', { sessionId: activeSessionId, data: `${translatedCommand}\n` });
    setTranslatedCommand(null);
    setAiPrompt('');
  };

  const explainFailure = async () => {
    if (!failedSessionId) return;
    setLoadingDiagnosis(true);
    setAiDiagnosis(null);
    try {
      const res = await api.post(`/workspaces/${activeWorkspace._id}/terminal-ai/explain-failure`, {
        command: failedCommand,
        exitCode: 1,
        output: failedOutput
      });
      setAiDiagnosis(res.data.explanation);
    } catch (err: any) {
      setAiDiagnosis(`Failed to diagnose error: ${err.message || err}`);
    } finally {
      setLoadingDiagnosis(false);
    }
  };

  // Auto-spawn initial terminal tab on load
  useEffect(() => {
    const termStore = useTerminalStore.getState();
    if (activeWorkspace && sessions.length === 0 && !termStore.hasSpawnedInitial) {
      useTerminalStore.setState({ hasSpawnedInitial: true });
      createTerminal(activeWorkspace._id);
    }
  }, [activeWorkspace, sessions.length, createTerminal]);

  if (!activeWorkspace) return null;

  const handleStartRename = (tab: TerminalTab) => {
    setEditingSessionId(tab.id);
    setRenameValue(tab.name);
  };

  const handleSaveRename = (sessionId: string) => {
    if (renameValue.trim()) {
      renameTerminal(sessionId, renameValue.trim());
    }
    setEditingSessionId(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-t border-[#3c3c3c]">
      {/* Terminal Tab bar header */}
      <div className="flex items-center justify-between h-9 bg-[#252526] border-b border-[#3c3c3c] px-3 select-none">
        <div className="flex items-center space-x-1 overflow-x-auto h-full pr-4">
          {sessions.map((tab) => {
            const isActive = tab.id === activeSessionId && activeTabType === 'terminals';
            const isEditing = tab.id === editingSessionId;

            return (
              <div
                key={tab.id}
                onClick={() => {
                  if (!isEditing) {
                    setActiveTabType('terminals');
                    setActiveSession(tab.id);
                  }
                }}
                className={`flex items-center space-x-1.5 px-3 h-full border-r border-[#3c3c3c] cursor-pointer text-xs transition-colors ${
                  isActive
                    ? 'bg-[#1e1e1e] text-white border-t-2 border-t-blue-500 font-medium'
                    : 'bg-[#252526] text-gray-400 hover:bg-[#2a2a2b] hover:text-gray-200'
                }`}
              >
                <TermIcon size={12} className={isActive ? 'text-blue-400' : 'text-gray-500'} />
                
                {isEditing ? (
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(tab.id)}
                    className="bg-[#1e1e1e] border border-blue-500 rounded px-1 text-[10px] text-white focus:outline-none w-20"
                    autoFocus
                  />
                ) : (
                  <span className="truncate max-w-[80px]">{tab.name}</span>
                )}

                {/* Edit & Confirm rename controls */}
                {isActive && (
                  <div className="flex items-center space-x-0.5">
                    {isEditing ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveRename(tab.id);
                        }}
                        className="p-0.5 hover:bg-[#333] rounded text-gray-400 hover:text-green-400"
                      >
                        <Check size={10} />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(tab);
                        }}
                        className="p-0.5 hover:bg-[#333] rounded text-gray-400 hover:text-white"
                      >
                        <Edit2 size={10} />
                      </button>
                    )}
                  </div>
                )}

                {/* Close terminal tab */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTerminal(activeWorkspace._id, tab.id);
                  }}
                  className="p-0.5 hover:bg-[#333] rounded text-gray-400 hover:text-red-400"
                  title="Close terminal session"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}

          {/* New terminal button */}
          <button
            onClick={() => {
              setActiveTabType('terminals');
              createTerminal(activeWorkspace._id);
            }}
            className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white ml-1.5 cursor-pointer"
            title="Open new terminal tab"
          >
            <Plus size={13} />
          </button>

          {/* Sibling Tab: Problems */}
          <div
            onClick={() => setActiveTabType('problems')}
            className={`flex items-center space-x-1.5 px-3 h-full border-r border-[#3c3c3c] cursor-pointer text-xs transition-colors ${
              activeTabType === 'problems'
                ? 'bg-[#1e1e1e] text-white border-t-2 border-t-blue-500 font-medium'
                : 'bg-[#252526] text-gray-400 hover:bg-[#2a2a2b] hover:text-gray-200'
            }`}
          >
            <AlertCircle size={12} className={activeTabType === 'problems' ? 'text-red-400' : 'text-gray-500'} />
            <span>Problems</span>
          </div>

          {/* Sibling Tab: Tasks */}
          <div
            onClick={() => setActiveTabType('tasks')}
            className={`flex items-center space-x-1.5 px-3 h-full border-r border-[#3c3c3c] cursor-pointer text-xs transition-colors ${
              activeTabType === 'tasks'
                ? 'bg-[#1e1e1e] text-white border-t-2 border-t-blue-500 font-medium'
                : 'bg-[#252526] text-gray-400 hover:bg-[#2a2a2b] hover:text-gray-200'
            }`}
          >
            <Play size={12} className={activeTabType === 'tasks' ? 'text-blue-400' : 'text-gray-500'} />
            <span>Tasks</span>
          </div>

          {/* Sibling Tab: Tests */}
          <div
            onClick={() => setActiveTabType('tests')}
            className={`flex items-center space-x-1.5 px-3 h-full border-r border-[#3c3c3c] cursor-pointer text-xs transition-colors ${
              activeTabType === 'tests'
                ? 'bg-[#1e1e1e] text-white border-t-2 border-t-blue-500 font-medium'
                : 'bg-[#252526] text-gray-400 hover:bg-[#2a2a2b] hover:text-gray-200'
            }`}
          >
            <FlaskConical size={12} className={activeTabType === 'tests' ? 'text-purple-400' : 'text-gray-500'} />
            <span>Tests</span>
          </div>

          {/* Sibling Tab: Snippets */}
          <div
            onClick={() => setActiveTabType('snippets')}
            className={`flex items-center space-x-1.5 px-3 h-full border-r border-[#3c3c3c] cursor-pointer text-xs transition-colors ${
              activeTabType === 'snippets'
                ? 'bg-[#1e1e1e] text-white border-t-2 border-t-blue-500 font-medium'
                : 'bg-[#252526] text-gray-400 hover:bg-[#2a2a2b] hover:text-gray-200'
            }`}
          >
            <FileCode size={12} className={activeTabType === 'snippets' ? 'text-yellow-400' : 'text-gray-500'} />
            <span>Snippets</span>
          </div>

          {/* Sibling Tab: Running Processes */}
          <div
            onClick={() => setActiveTabType('processes')}
            className={`flex items-center space-x-1.5 px-3 h-full border-r border-[#3c3c3c] cursor-pointer text-xs transition-colors ${
              activeTabType === 'processes'
                ? 'bg-[#1e1e1e] text-white border-t-2 border-t-blue-500 font-medium'
                : 'bg-[#252526] text-gray-400 hover:bg-[#2a2a2b] hover:text-gray-200'
            }`}
          >
            <Cpu size={12} className={activeTabType === 'processes' ? 'text-blue-400' : 'text-gray-500'} />
            <span>Processes</span>
          </div>

          {/* Sibling Tab: Debug Console (Module 84) */}
          <div
            onClick={() => setActiveTabType('console')}
            className={`flex items-center space-x-1.5 px-3 h-full border-r border-[#3c3c3c] cursor-pointer text-xs transition-colors ${
              activeTabType === 'console'
                ? 'bg-[#1e1e1e] text-white border-t-2 border-t-blue-500 font-medium'
                : 'bg-[#252526] text-gray-400 hover:bg-[#2a2a2b] hover:text-gray-200'
            }`}
          >
            <TermIcon size={12} className={activeTabType === 'console' ? 'text-blue-400' : 'text-gray-500'} />
            <span>Debug Console</span>
          </div>
        </div>
      </div>

      {/* Terminal Viewport */}
      <div className="flex-1 min-h-0 w-full bg-[#1e1e1e] relative flex flex-col">
        {activeTabType === 'terminals' && (
          <div className="p-2 border-b border-[#2d2d2d] bg-[#222222]/90 flex flex-col space-y-1.5 z-20 text-xs">
            <form onSubmit={handleAiSubmit} className="flex items-center space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ask Terminal AI to translate commands (e.g. 'Install Express', 'Run Python file')..."
                  className="w-full bg-[#1e1e1e] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded pl-8 pr-3 py-1.5 text-xs text-gray-200"
                />
                <Sparkles size={14} className="absolute left-2.5 top-2 text-purple-400 animate-pulse" />
              </div>
              <button
                type="submit"
                disabled={loadingTranslation}
                className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded transition-colors text-xs disabled:opacity-50 shrink-0"
              >
                {loadingTranslation ? 'Translating...' : 'Translate'}
              </button>
              <label className="flex items-center space-x-1.5 text-gray-400 select-none text-[10px] shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRun}
                  onChange={(e) => setAutoRun(e.target.checked)}
                  className="rounded border-[#3e3e3e] bg-[#1e1e1e] text-blue-600 focus:ring-0 focus:ring-offset-0"
                />
                <span>Auto-run</span>
              </label>
            </form>

            {/* Translation Confirmation Banner */}
            {translatedCommand && (
              <div className="p-2 bg-[#2d2d30] border border-blue-500/30 rounded flex items-center justify-between text-[11px] animate-fade-in">
                <div className="flex items-center space-x-2">
                  <span className="text-gray-400">Translated Command:</span>
                  <code className="bg-[#1e1e1e] px-1.5 py-0.5 rounded text-yellow-400 font-mono">{translatedCommand}</code>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setTranslatedCommand(null)}
                    className="px-2 py-0.5 bg-[#3e3e42] hover:bg-[#4e4e52] text-gray-300 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={executeCommand}
                    className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded"
                  >
                    Execute
                  </button>
                </div>
              </div>
            )}

            {/* Failure diagnosis prompt */}
            {failedSessionId && (
              <div className="p-2 bg-red-950/20 border border-red-800/20 rounded flex flex-col space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-red-400 font-semibold flex items-center space-x-1">
                    <AlertCircle size={12} />
                    <span>Last command failed in terminal!</span>
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setFailedSessionId(null)}
                      className="px-2 py-0.5 bg-[#3e3e42] text-gray-300 rounded text-[10px]"
                    >
                      Clear
                    </button>
                    <button
                      onClick={explainFailure}
                      disabled={loadingDiagnosis}
                      className="px-2.5 py-0.5 bg-purple-700 hover:bg-purple-800 text-white font-semibold rounded transition-colors text-[10px]"
                    >
                      {loadingDiagnosis ? 'Diagnosing...' : 'AI Explain Failure'}
                    </button>
                  </div>
                </div>
                {aiDiagnosis && (
                  <div className="mt-1.5 p-2 bg-[#181819] border border-[#2d2d2d] rounded text-gray-300 whitespace-pre-wrap font-sans max-h-32 overflow-y-auto">
                    {aiDiagnosis}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTabType === 'processes' ? (
          <ProcessPanel />
        ) : activeTabType === 'console' ? (
          <DebugConsole />
        ) : activeTabType === 'problems' ? (
          <ProblemsPanel />
        ) : activeTabType === 'tasks' ? (
          <TasksPanel />
        ) : activeTabType === 'tests' ? (
          <TestExplorerPanel />
        ) : activeTabType === 'snippets' ? (
          <UserSnippetsPanel />
        ) : sessions.length > 0 ? (
          <div className="flex-1 flex w-full h-full divide-x divide-[#2d2d2d] bg-[#1e1e1e]">
            {sessions.map((s) => (
              <div 
                key={s.id} 
                onClick={() => setActiveSession(s.id)}
                className={`flex-1 h-full min-w-0 border-2 ${
                  s.id === activeSessionId ? 'border-blue-500/25' : 'border-transparent'
                }`}
              >
                <XtermInstance 
                  workspaceId={activeWorkspace._id} 
                  sessionId={s.id} 
                  theme={activeWorkspace.settings?.theme || 'dark'}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-xs">
            No terminals open. Click the '+' button to open a shell.
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// INDIVIDUAL TERMINAL PTYS INSTANCE COMPONENT
// -------------------------------------------------------------
function XtermInstance({ 
  workspaceId, 
  sessionId,
  theme
}: { 
  workspaceId: string; 
  sessionId: string;
  theme: 'light' | 'dark';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!containerRef.current) return;

    // Apply color palettes matching workspace theme (Module 26)
    const terminalTheme = theme === 'light' ? {
      background: '#ffffff',
      foreground: '#333333',
      cursor: '#333333',
      cursorAccent: '#ffffff',
      selectionBackground: '#add6ff',
      black: '#000000',
      red: '#cd3131',
      green: '#00bc00',
      yellow: '#949800',
      blue: '#0451a5',
      magenta: '#bc05bc',
      cyan: '#0598bc',
      white: '#e5e5e5',
    } : {
      background: '#1e1e1e',
      foreground: '#cccccc',
      cursor: '#cccccc',
      cursorAccent: '#1e1e1e',
      selectionBackground: '#264f78',
      black: '#000000',
      red: '#cd3131',
      green: '#0dba96',
      yellow: '#cdcd00',
      blue: '#569cd6',
      magenta: '#c586c0',
      cyan: '#4ec9b0',
      white: '#e5e5e5',
    };

    // 1. Initialize xterm.js instance
    const term = new Terminal({
      cursorBlink: true,
      theme: terminalTheme,
      fontSize: 12,
      fontFamily: 'Fira Code, Consolas, Monaco, monospace',
      rows: 24,
      cols: 80,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    
    term.open(containerRef.current);

    let isDisposed = false;
    const safeFit = () => {
      try {
        if (isDisposed) return;
        if (containerRef.current && containerRef.current.clientWidth > 0 && containerRef.current.clientHeight > 0 && term.element) {
          fitAddon.fit();
        }
      } catch (e) {
        // Safe check
      }
    };

    safeFit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // 2. Open / Connect backend websocket
    const socket = getTerminalSocket();
    if (!socket.connected) {
      socket.connect();
    }

    const handleConnect = () => {
      console.log(`[Socket/Terminal] Socket connected/reconnected, registering session: ${sessionId}`);
      socket.emit('join', workspaceId);
      socket.emit('create-session', {
        workspaceId,
        sessionId,
        cols: term.cols || 80,
        rows: term.rows || 24,
      });
    };

    // Emit initial registration
    handleConnect();

    // Listen to reconnection events
    socket.on('connect', handleConnect);

    // 3. Write data events
    term.onData((inputData) => {
      socket.emit('input', { sessionId, data: inputData });
    });

    // Notify backend size change when xterm sizes resize
    term.onResize((size) => {
      socket.emit('resize', { sessionId, cols: size.cols, rows: size.rows });
    });

    // 4. Register socket output listeners
    const handleOutput = (payload: { sessionId: string; data: string }) => {
      if (payload.sessionId === sessionId) {
        term.write(payload.data);
      }
    };

    const handleExit = (payload: { sessionId: string; exitCode?: number }) => {
      if (payload.sessionId === sessionId) {
        term.write(`\r\n[Terminal process exited with code ${payload.exitCode ?? 0}]\r\n`);
        if (payload.exitCode && payload.exitCode !== 0) {
          const event = new CustomEvent('terminal-failure', { 
            detail: { sessionId, exitCode: payload.exitCode } 
          });
          window.dispatchEvent(event);
        }
      }
    };

    const handleSessionError = (payload: { sessionId: string; error: string }) => {
      if (payload.sessionId === sessionId) {
        term.write(`\r\n\x1b[31m[Error: ${payload.error}]\x1b[0m\r\n`);
      }
    };

    socket.on('output', handleOutput);
    socket.on('exit', handleExit);
    socket.on('session-error', handleSessionError);

    // 5. Setup layout ResizeObserver (Module 36)
    const observer = new ResizeObserver(() => {
      safeFit();
    });

    // Observe parent element to capture resizing sidebars or height drags
    if (containerRef.current.parentElement) {
      observer.observe(containerRef.current.parentElement);
    }

    // Key listener inside xterm elements for Ctrl+F toggles
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
    };

    const containerEl = containerRef.current;
    containerEl?.addEventListener('keydown', handleKeyDown);

    return () => {
      isDisposed = true;
      socket.off('connect', handleConnect);
      socket.off('output', handleOutput);
      socket.off('exit', handleExit);
      socket.off('session-error', handleSessionError);
      observer.disconnect();
      containerEl?.removeEventListener('keydown', handleKeyDown);
      searchAddonRef.current = null;
      term.dispose();
    };
  }, [workspaceId, sessionId, theme]);

  return (
    <div className="relative w-full h-full">
      <div 
        ref={containerRef} 
        className="absolute inset-0 p-2 overflow-hidden bg-[#1e1e1e]"
      />

      {showSearch && (
        <div className="absolute top-2 right-6 bg-[#252526] border border-[#3c3c3c] rounded shadow-lg p-1.5 flex items-center space-x-1.5 z-30 select-none text-xs">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchAddonRef.current?.findNext(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) {
                  searchAddonRef.current?.findPrevious(searchQuery);
                } else {
                  searchAddonRef.current?.findNext(searchQuery);
                }
              } else if (e.key === 'Escape') {
                setShowSearch(false);
                terminalRef.current?.focus();
              }
            }}
            placeholder="Find..."
            className="bg-[#1e1e1e] border border-[#3c3c3c] text-white px-2 py-0.5 rounded text-[10px] w-32 focus:outline-none focus:border-blue-500"
            autoFocus
          />
          
          <button
            onClick={() => searchAddonRef.current?.findPrevious(searchQuery)}
            className="px-1 py-0.5 hover:bg-[#333] rounded text-gray-400 hover:text-white"
            title="Previous match (Shift+Enter)"
          >
            &uarr;
          </button>
          <button
            onClick={() => searchAddonRef.current?.findNext(searchQuery)}
            className="px-1 py-0.5 hover:bg-[#333] rounded text-gray-400 hover:text-white"
            title="Next match (Enter)"
          >
            &darr;
          </button>
          <button
            onClick={() => setShowSearch(false)}
            className="px-1 py-0.5 hover:bg-[#333] rounded text-gray-400 hover:text-red-400 font-bold"
            title="Close search overlay (Esc)"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
