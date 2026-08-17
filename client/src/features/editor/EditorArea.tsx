import React, { useRef, useState, useEffect } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { useLayoutStore } from '../../shared/stores/useLayoutStore';
import type { LayoutNode } from '../../shared/stores/useLayoutStore';
import { useEditorStore } from '../../shared/stores/useEditorStore';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { useUIStore } from '../../shared/stores/useUIStore';
import { useNavigationStore } from '../../shared/stores/useNavigationStore';
import { getOrCreateModel } from './modelManager';
import TabBar from './TabBar';
import FindReplaceWidget from './FindReplaceWidget';
import PreviewPanel from '../preview/PreviewPanel';
import WelcomeTab from './WelcomeTab';
import PlaygroundTab from './PlaygroundTab';
import NotebookTab from './NotebookTab';
import { triggerSessionSave, cursorPositionsCache } from '../../shared/hooks/useSessionRestore';
import { useDocumentSync } from '../../shared/hooks/useDocumentSync';
import { useCursorStore } from '../../shared/stores/useCursorStore';
import { useAuthStore } from '../../shared/stores/useAuthStore';
import { useFollowStore } from '../../shared/stores/useFollowStore';
import { api } from '../../shared/lib/api';
import { useDebugStore } from '../../shared/stores/useDebugStore';
import GitGraphPanel from '../source-control/GitGraphPanel';
import { 
  Layers
} from 'lucide-react';

export default function EditorArea() {
  const { layoutTree } = useLayoutStore();

  return (
    <div className="flex-1 w-full h-full bg-[#1e1e1e] overflow-hidden select-none relative">
      <RenderPane node={layoutTree} />
    </div>
  );
}

// -------------------------------------------------------------
// RECURSIVE PANE RENDERER
// -------------------------------------------------------------
function RenderPane({ node }: { node: LayoutNode }) {
  const { updateRatio } = useLayoutStore();
  const branchRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  if (node.type === 'leaf') {
    return <LeafPane node={node} />;
  }

  // Resizing handler for branch splits
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!branchRef.current) return;
      const rect = branchRef.current.getBoundingClientRect();
      let ratio = 0.5;

      if (node.direction === 'horizontal') {
        ratio = (e.clientX - rect.left) / rect.width;
      } else {
        ratio = (e.clientY - rect.top) / rect.height;
      }
      updateRatio(node.id, ratio);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, node.direction, node.id, updateRatio]);

  const isHorizontal = node.direction === 'horizontal';

  return (
    <div 
      ref={branchRef}
      className={`w-full h-full flex ${isHorizontal ? 'flex-row' : 'flex-col'}`}
    >
      {/* Sibling 1 */}
      <div 
        style={{ flex: node.ratio }} 
        className="min-w-0 min-h-0 overflow-hidden"
      >
        <RenderPane node={node.children[0]} />
      </div>

      {/* Resize Handle Divider */}
      <div 
        onMouseDown={handleMouseDown}
        className={`z-20 bg-[#3c3c3c] hover:bg-blue-500/50 transition-colors flex-shrink-0 relative ${
          isHorizontal 
            ? 'w-1 cursor-col-resize h-full' 
            : 'h-1 cursor-row-resize w-full'
        }`}
      />

      {/* Sibling 2 */}
      <div 
        style={{ flex: 1 - node.ratio }} 
        className="min-w-0 min-h-0 overflow-hidden"
      >
        <RenderPane node={node.children[1]} />
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// LEAF PANE COMPONENT (TabBar + Monaco Editor + Drop Zones)
// -------------------------------------------------------------
function LeafPane({ node }: { node: LayoutNode & { type: 'leaf' } }) {
  const { activeWorkspace } = useWorkspaceStore();
  const { openTabs: globalTabs, updateTabContent, openTab, pendingLineFocus, clearLineFocus } = useEditorStore();
  const { 
    activePaneId, 
    setActivePane, 
    splitPane, 
    closeTab
  } = useLayoutStore();

  const isActivePane = activePaneId === node.id;
  const activeFile = node.activeTab;
  const currentTab = globalTabs.find(t => t.path === activeFile);

  const [isDragOver, setIsDragOver] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const inlineCompletionsDisposablesRef = useRef<any[]>([]);
  
  const [diffOriginal, setDiffOriginal] = useState('');
  const [diffModified, setDiffModified] = useState('');
  const [loadingDiff, setLoadingDiff] = useState(false);

  useEffect(() => {
    if (activeFile && activeFile.startsWith('git-diff:') && activeWorkspace) {
      const actualPath = activeFile.substring('git-diff:'.length);
      setLoadingDiff(true);
      const loadContents = async () => {
        try {
          const origRes = await api.get(`/workspaces/${activeWorkspace._id}/git/show`, {
            params: { path: actualPath }
          });
          const modRes = await api.get(`/workspaces/${activeWorkspace._id}/files/content`, {
            params: { filePath: actualPath }
          });
          setDiffOriginal(origRes.data);
          setDiffModified(modRes.data);
        } catch (err) {
          console.error('Failed to load diff content:', err);
        } finally {
          setLoadingDiff(false);
        }
      };
      loadContents();
    }
  }, [activeFile, activeWorkspace]);

  useEffect(() => {
    return () => {
      inlineCompletionsDisposablesRef.current.forEach((d) => d.dispose());
    };
  }, []);

  const breakpoints = useDebugStore((state) => state.breakpoints);
  const debugStatus = useDebugStore((state) => state.status);
  const toggleBreakpoint = useDebugStore((state) => state.toggleBreakpoint);
  const activeFrame = useDebugStore((state) => {
    if (state.status === 'paused' && state.activeFrameId !== null) {
      return state.callStack.find(f => f.id === state.activeFrameId);
    }
    return null;
  });

  // Git Blame active line details state (Module 70)
  const [blameLines, setBlameLines] = useState<any[] | null>(null);
  const [activeLineBlame, setActiveLineBlame] = useState<any | null>(null);
  const blameLinesRef = useRef<any[] | null>(null);

  // Ctrl+K Inline AI state
  const [inlineAIWidget, setInlineAIWidget] = useState<{
    visible: boolean;
    paneId: string;
    top: number;
    left: number;
    height: number;
    lineNumber: number;
    column: number;
    selection: any;
  } | null>(null);
  const [inlineAIPrompt, setInlineAIPrompt] = useState('');
  const [inlineAILoading, setInlineAILoading] = useState(false);

  useEffect(() => {
    const handleShowInlineAI = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail.paneId === node.id) {
        setInlineAIWidget({
          visible: true,
          paneId: customEvent.detail.paneId,
          top: customEvent.detail.top,
          left: customEvent.detail.left,
          height: customEvent.detail.height,
          lineNumber: customEvent.detail.lineNumber,
          column: customEvent.detail.column,
          selection: customEvent.detail.selection
        });
        setInlineAIPrompt('');
      }
    };
    window.addEventListener('show-inline-ai', handleShowInlineAI);
    return () => {
      window.removeEventListener('show-inline-ai', handleShowInlineAI);
    };
  }, [node.id]);

  useEffect(() => {
    blameLinesRef.current = blameLines;
  }, [blameLines]);

  useEffect(() => {
    if (!activeWorkspace || !activeFile || activeFile.startsWith('preview:')) {
      setBlameLines(null);
      setActiveLineBlame(null);
      return;
    }

    const loadBlame = async () => {
      try {
        const res = await api.get(`/workspaces/${activeWorkspace._id}/git/blame`, {
          params: { path: activeFile }
        });
        setBlameLines(res.data);
      } catch (err) {
        console.error('Failed to load git blame info:', err);
        setBlameLines(null);
      }
    };
    loadBlame();
  }, [activeFile, activeWorkspace]);

  const remoteCursors = useCursorStore((state) => state.remoteCursors);
  const { user } = useAuthStore();

  // Jump to specific line focusing listener
  useEffect(() => {
    if (editorRef.current && pendingLineFocus && pendingLineFocus.path === activeFile) {
      const line = pendingLineFocus.line;
      editorRef.current.revealLineInCenter(line);
      editorRef.current.setPosition({ lineNumber: line, column: 1 });
      editorRef.current.focus();
      clearLineFocus();
    }
  }, [pendingLineFocus, activeFile, clearLineFocus]);
  const decorationsRef = useRef<string[]>([]);

  // 1. Invoke Real-Time Yjs Document Sync Engine
  useDocumentSync({
    workspaceId: activeWorkspace?._id || '',
    filePath: activeFile || '',
    editor: editorRef.current,
    onSever: () => {
      if (activeFile) {
        closeTab(node.id, activeFile);
      }
    },
  });

  // Follow Leader Viewport Tracker (Module 52)
  const { followedUserId } = useFollowStore();
  const followedCursor = followedUserId ? remoteCursors[followedUserId] : null;

  useEffect(() => {
    if (!editorRef.current || !followedCursor || !activeWorkspace) return;

    if (followedCursor.filePath !== activeFile) {
      openTab(activeWorkspace._id, followedCursor.filePath);
    } else if (followedCursor.position) {
      editorRef.current.revealPositionInCenter(followedCursor.position, 1 /* smooth */);
    }
  }, [followedCursor, activeFile, activeWorkspace, openTab]);

  // 2. Clear old remote decorations on tab switches
  useEffect(() => {
    return () => {
      if (editorRef.current && decorationsRef.current.length > 0) {
        editorRef.current.deltaDecorations(decorationsRef.current, []);
        decorationsRef.current = [];
      }
    };
  }, [activeFile]);

  // Inject debugger styles once to head on mount (Modules 79, 89)
  useEffect(() => {
    const styleId = 'monaco-debug-styles';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.innerHTML = `
        .breakpoint-glyph {
          background: #e51400 !important;
          border-radius: 50%;
          width: 10px !important;
          height: 10px !important;
          margin-left: 5px;
          margin-top: 4px;
          box-shadow: 0 0 4px #e51400;
          cursor: pointer;
        }
        .breakpoint-glyph-disabled {
          background: rgba(229, 20, 0, 0.3) !important;
          border: 1px solid #e51400 !important;
          border-radius: 50%;
          width: 8px !important;
          height: 8px !important;
          margin-left: 6px;
          margin-top: 5px;
          cursor: pointer;
        }
        .breakpoint-glyph-conditional {
          background: #f1c40f !important;
          border-radius: 20%;
          width: 10px !important;
          height: 10px !important;
          margin-left: 5px;
          margin-top: 4px;
          cursor: pointer;
        }
        .breakpoint-glyph-logpoint {
          background: #9b59b6 !important;
          clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%) !important;
          width: 10px !important;
          height: 10px !important;
          margin-left: 5px;
          margin-top: 4px;
          cursor: pointer;
        }
        .debug-paused-line {
          background: rgba(255, 235, 59, 0.15) !important;
          border-top: 1px solid rgba(255, 235, 59, 0.3) !important;
          border-bottom: 1px solid rgba(255, 235, 59, 0.3) !important;
        }
        .debug-paused-glyph {
          background: #f1c40f !important;
          clip-path: polygon(0% 0%, 100% 50%, 0% 100%) !important;
          width: 10px !important;
          height: 10px !important;
          margin-left: 6px;
          margin-top: 4px;
        }
        .debug-exception-line {
          background: rgba(244, 67, 54, 0.15) !important;
          border-top: 1px solid rgba(244, 67, 54, 0.3) !important;
          border-bottom: 1px solid rgba(244, 67, 54, 0.3) !important;
        }
        .debug-exception-glyph {
          background: #f44336 !important;
          clip-path: polygon(20% 0%, 80% 0%, 100% 20%, 100% 80%, 80% 100%, 20% 100%, 0% 80%, 0% 20%) !important;
          width: 10px !important;
          height: 10px !important;
          margin-left: 5px;
          margin-top: 4px;
        }
      `;
      document.head.appendChild(styleEl);
    }
  }, []);

  const bpDecorationsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeFile) return;

    const fileBps = breakpoints.filter((b) => b.filePath === activeFile);
    const newDecorations: any[] = [];

    // 1. Breakpoints
    fileBps.forEach((bp) => {
      let className = 'breakpoint-glyph';
      let hoverText = 'Breakpoint';
      if (bp.condition) {
        className = 'breakpoint-glyph-conditional';
        hoverText = `Conditional Breakpoint: ${bp.condition}`;
      } else if (bp.logMessage) {
        className = 'breakpoint-glyph-logpoint';
        hoverText = `Logpoint: ${bp.logMessage}`;
      }
      if (!bp.enabled) {
        className += '-disabled';
        hoverText += ' (Disabled)';
      }

      newDecorations.push({
        range: new monacoRef.current.Range(bp.line, 1, bp.line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: className,
          glyphMarginHoverMessage: { value: hoverText },
        },
      });
    });

    // 2. Paused Line / Exception highlight
    if (debugStatus === 'paused' && activeFrame && activeFrame.source?.path === activeFile) {
      const isExceptionStop = activeFrame.name.toLowerCase().includes('exception') || activeFrame.name.toLowerCase().includes('error');
      newDecorations.push({
        range: new monacoRef.current.Range(activeFrame.line, 1, activeFrame.line, 1),
        options: {
          isWholeLine: true,
          className: isExceptionStop ? 'debug-exception-line' : 'debug-paused-line',
          glyphMarginClassName: isExceptionStop ? 'debug-exception-glyph' : 'debug-paused-glyph',
          glyphMarginHoverMessage: { value: isExceptionStop ? 'Paused on Exception' : 'Paused here' },
        },
      });
    }

    bpDecorationsRef.current = editorRef.current.deltaDecorations(
      bpDecorationsRef.current,
      newDecorations
    );
  }, [breakpoints, debugStatus, activeFrame, activeFile]);

  // 3. Render remote collaborator cursor and selection highlights (Module 48)
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeFile) return;

    const newDecorations: any[] = [];
    const fileCursors = Object.values(remoteCursors).filter(
      (c) => c.filePath === activeFile && c.userId !== user?.id
    );

    fileCursors.forEach((rc) => {
      if (rc.position) {
        newDecorations.push({
          range: new monacoRef.current.Range(
            rc.position.lineNumber,
            rc.position.column,
            rc.position.lineNumber,
            rc.position.column
          ),
          options: {
            className: `remote-cursor-${rc.userId}`,
            hoverMessage: { value: rc.name },
          },
        });

        // Inject dynamic style block for collaborator color scheme
        const styleId = `style-cursor-${rc.userId}`;
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = styleId;
          styleEl.innerHTML = `
            .remote-cursor-${rc.userId} {
              border-left: 2px solid ${rc.color} !important;
              margin-left: -1px;
            }
            .remote-selection-${rc.userId} {
              background-color: ${rc.color}25 !important;
            }
          `;
          document.head.appendChild(styleEl);
        }
      }

      if (rc.selection) {
        newDecorations.push({
          range: new monacoRef.current.Range(
            rc.selection.startLineNumber,
            rc.selection.startColumn,
            rc.selection.endLineNumber,
            rc.selection.endColumn
          ),
          options: {
            className: `remote-selection-${rc.userId}`,
            isWholeLine: false,
          },
        });
      }
    });

    decorationsRef.current = editorRef.current.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );
  }, [remoteCursors, activeFile, user]);

  // Synchronize Monaco model when active tab changes
  useEffect(() => {
    setActiveLineBlame(null);
    if (!editorRef.current || !monacoRef.current || !activeFile || !currentTab) return;

    // Load or create the persistent ITextModel
    const model = getOrCreateModel(monacoRef.current, activeFile, currentTab.content);
    
    // Set the model on this editor instance
    if (editorRef.current.getModel() !== model) {
      editorRef.current.setModel(model);

      // Restore cursor position and scroll offsets if cached
      const cachedPos = cursorPositionsCache[activeFile];
      if (cachedPos) {
        setTimeout(() => {
          if (editorRef.current) {
            editorRef.current.setPosition({ lineNumber: cachedPos.lineNumber, column: cachedPos.column });
            editorRef.current.setScrollTop(cachedPos.scrollTop);
            editorRef.current.setScrollLeft(cachedPos.scrollLeft);
          }
        }, 50);
      }
    }

    if (activeWorkspace) {
      const ext = activeFile.split('.').pop()?.toLowerCase() || '';
      const langMap: Record<string, string> = {
        py: 'python',
        js: 'javascript',
        jsx: 'javascript',
        ts: 'typescript',
        tsx: 'typescript',
        cpp: 'cpp',
        c: 'c',
        go: 'go',
        rs: 'rust',
        java: 'java',
        php: 'php'
      };
      const lang = langMap[ext];
      if (lang) {
        import('./lspClient').then(({ LSPClient }) => {
          LSPClient.initialize(activeWorkspace._id, lang, activeFile);
        });
      }
    }
  }, [activeFile, currentTab, activeWorkspace]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    (window as any).activeMonacoEditor = editor;
    (window as any).monaco = monaco;
    if (activeWorkspace) {
      (window as any).activeWorkspaceId = activeWorkspace._id;
    }

    // Initialize LSP Client listeners and initial session
    import('./lspClient').then(({ LSPClient }) => {
      LSPClient.setupListeners(monaco);
      if (activeFile && activeWorkspace) {
        const ext = activeFile.split('.').pop()?.toLowerCase() || '';
        const langMap: Record<string, string> = {
          py: 'python',
          js: 'javascript',
          jsx: 'javascript',
          ts: 'typescript',
          tsx: 'typescript',
          cpp: 'cpp',
          c: 'c',
          go: 'go',
          rs: 'rust',
          java: 'java',
          php: 'php'
        };
        const lang = langMap[ext];
        if (lang) {
          LSPClient.initialize(activeWorkspace._id, lang, activeFile);
        }
      }
    });

    // Trigger initial model sync if file is already active
    if (activeFile && currentTab) {
      const model = getOrCreateModel(monaco, activeFile, currentTab.content);
      editor.setModel(model);

      // Restore cursor position and scroll offsets if cached
      const cachedPos = cursorPositionsCache[activeFile];
      if (cachedPos) {
        setTimeout(() => {
          editor.setPosition({ lineNumber: cachedPos.lineNumber, column: cachedPos.column });
          editor.setScrollTop(cachedPos.scrollTop);
          editor.setScrollLeft(cachedPos.scrollLeft);
          editor.focus();
        }, 50);
      }
    }

    // Gutter Click to toggle breakpoints (Module 79)
    editor.onMouseDown((e: any) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || 
          e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
        const line = e.target.position.lineNumber;
        if (activeFile && activeWorkspace) {
          toggleBreakpoint(activeWorkspace._id, activeFile, line);
        }
      }
    });

    // Capture editor focus to update activePaneId
    editor.onDidFocusEditorWidget(() => {
      setActivePane(node.id);
      (window as any).activeMonacoEditor = editor;
      (window as any).activeTabPath = activeFile;
    });

    // Add Ctrl+F command to open search widget
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
      setFindOpen(true);
    });

    // Add Ctrl+K command to show inline AI prompt widget
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      const position = editor.getPosition();
      const selection = editor.getSelection();
      if (position) {
        const coordinates = editor.getScrolledVisiblePosition(position);
        if (coordinates) {
          const event = new CustomEvent('show-inline-ai', {
            detail: {
              paneId: node.id,
              top: coordinates.top,
              left: coordinates.left,
              height: coordinates.height,
              lineNumber: position.lineNumber,
              column: position.column,
              selection
            }
          });
          window.dispatchEvent(event);
        }
      }
    });

    // Listen to value changes inside Monaco and update the global store
    editor.onDidChangeModelContent(() => {
      if (activeFile && activeWorkspace) {
        const value = editor.getValue();
        updateTabContent(activeWorkspace._id, activeFile, value);
        
        // Sync document edit with LSP Client
        const ext = activeFile.split('.').pop()?.toLowerCase() || '';
        const langMap: Record<string, string> = {
          py: 'python',
          js: 'javascript',
          jsx: 'javascript',
          ts: 'typescript',
          tsx: 'typescript',
          cpp: 'cpp',
          c: 'c',
          go: 'go',
          rs: 'rust',
          java: 'java',
          php: 'php'
        };
        const lang = langMap[ext];
        if (lang) {
          import('./lspClient').then(({ LSPClient }) => {
            LSPClient.handleDocumentChange(activeWorkspace._id, lang, activeFile, value);
          });
        }

        // Track last edit location
        const pos = editor.getPosition();
        if (pos) {
          useNavigationStore.getState().setLastEditLocation({
            path: activeFile,
            lineNumber: pos.lineNumber,
            column: pos.column
          });
        }
      }
    });

    // Cache cursor changes and trigger session save
    editor.onDidChangeCursorPosition(() => {
      if (activeFile && activeWorkspace) {
        const pos = editor.getPosition();
        if (pos) {
          cursorPositionsCache[activeFile] = {
            lineNumber: pos.lineNumber,
            column: pos.column,
            scrollTop: editor.getScrollTop(),
            scrollLeft: editor.getScrollLeft(),
          };
          triggerSessionSave(activeWorkspace._id, useLayoutStore.getState().layoutTree, useLayoutStore.getState().activePaneId);
          
          // Push to back stack for Alt+Left navigation
          useNavigationStore.getState().pushLocation({
            path: activeFile,
            lineNumber: pos.lineNumber,
            column: pos.column
          });

          // Update Git Blame details (Module 70)
          if (blameLinesRef.current) {
            const blame = blameLinesRef.current[pos.lineNumber - 1];
            setActiveLineBlame(blame || null);
          } else {
            setActiveLineBlame(null);
          }
        }
      }
    });

    // Cache scroll changes and trigger session save
    editor.onDidScrollChange(() => {
      if (activeFile && activeWorkspace) {
        const pos = editor.getPosition() || { lineNumber: 1, column: 1 };
        cursorPositionsCache[activeFile] = {
          lineNumber: pos.lineNumber,
          column: pos.column,
          scrollTop: editor.getScrollTop(),
          scrollLeft: editor.getScrollLeft(),
        };
        triggerSessionSave(activeWorkspace._id, useLayoutStore.getState().layoutTree, useLayoutStore.getState().activePaneId);
      }
    });

    // Clean up any old inline completion providers
    inlineCompletionsDisposablesRef.current.forEach((d) => d.dispose());
    inlineCompletionsDisposablesRef.current = [];

    // Register inline completion providers for supported languages
    const languagesSupported = ['javascript', 'typescript', 'python', 'cpp', 'shell', 'html', 'css', 'plaintext'];
    
    languagesSupported.forEach((lang) => {
      const disposable = monaco.languages.registerInlineCompletionsProvider(lang, {
        provideInlineCompletions: async (model: any, position: any, _context: any, token: any) => {
          // Debounce: wait 350ms
          await new Promise((resolve) => setTimeout(resolve, 350));
          if (token.isCancellationRequested) {
            return { items: [] };
          }

          const text = model.getValue();
          const cursorOffset = model.getOffsetAt(position);
          const filePath = activeFile;

          if (!filePath || !activeWorkspace) return { items: [] };

          try {
            const res = await api.post(`/workspaces/${activeWorkspace._id}/ai/complete`, {
              filePath,
              text,
              cursorOffset,
              openTabs: node.openTabs
            });

            const { suggestions } = res.data;
            if (!suggestions || suggestions.length === 0) {
              return { items: [] };
            }

            const range = {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column
            };

            const items = suggestions.map((sug: string) => ({
              insertText: sug,
              range,
            }));

            return { items };
          } catch (err) {
            return { items: [] };
          }
        },
        freeInlineCompletions: () => {}
      });

      inlineCompletionsDisposablesRef.current.push(disposable);
    });
  };

  // Drag over handlers for splits
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('text/tab-path')) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDropOnZone = (e: React.DragEvent, splitDir: 'left' | 'right' | 'top' | 'bottom') => {
    e.preventDefault();
    setIsDragOver(false);

    const path = e.dataTransfer.getData('text/tab-path');
    const sourcePane = e.dataTransfer.getData('text/source-pane');

    if (!path || !sourcePane) return;

    if (sourcePane === node.id && node.openTabs.length === 1) {
      // Don't split a single-tab pane with itself
      return;
    }

    // Determine layout direction
    const direction = (splitDir === 'left' || splitDir === 'right') ? 'horizontal' : 'vertical';

    // Move tab first
    if (sourcePane !== node.id) {
      // Remove from old pane first before splitting
      closeTab(sourcePane, path);
    } else {
      // Close in this pane, so it stays only in the new split
      closeTab(node.id, path);
    }

    // Split target pane and seed it with the moved tab
    splitPane(node.id, direction, path);
  };

  const theme = activeWorkspace?.settings?.theme === 'light' ? 'vs' : 'vs-dark';
  const fontSize = activeWorkspace?.settings?.fontSize || 12;
  const tabSize = activeWorkspace?.settings?.tabSize || 2;
  const multiCursorModifier = useUIStore((state) => state.multiCursorModifier);
  const columnSelectionMode = useUIStore((state) => state.columnSelectionMode);
  const minimapVisible = useUIStore((state) => state.minimapVisible);
  const lineNumbersVisible = useUIStore((state) => state.lineNumbersVisible);
  const wordWrapMode = useUIStore((state) => state.wordWrapMode);
  const stickyScrollVisible = useUIStore((state) => state.stickyScrollVisible);

  return (
    <div 
      onClick={() => setActivePane(node.id)}
      className={`w-full h-full flex flex-col relative bg-[#1e1e1e] border ${
        isActivePane ? 'border-blue-500/30 shadow-2xl' : 'border-transparent'
      }`}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Pane Tab Bar */}
      <TabBar 
        paneId={node.id} 
        openTabs={node.openTabs} 
        activeTab={node.activeTab} 
      />

      {/* Breadcrumbs Bar */}
      {activeFile && !activeFile.startsWith('preview:') && (
        <div className="flex items-center h-6 px-3 bg-[#1c1c1f] border-b border-[#2d2d2d]/60 text-[10px] text-gray-500 space-x-1 select-none flex-shrink-0">
          <span className="hover:text-gray-300 cursor-pointer">{activeWorkspace?.name || 'Workspace'}</span>
          {activeFile.split('/').filter(Boolean).map((part, index, arr) => (
            <React.Fragment key={index}>
              <span className="text-gray-600">/</span>
              <span 
                className={`hover:text-gray-300 cursor-pointer ${index === arr.length - 1 ? 'text-gray-300 font-medium' : ''}`}
                title={arr.slice(0, index + 1).join('/')}
              >
                {part}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Editor Content Area */}
      <div className="flex-1 min-h-0 w-full relative">
        {activeFile ? (
          activeFile === 'welcome' ? (
            <WelcomeTab />
          ) : activeFile === 'playground' ? (
            <PlaygroundTab />
          ) : activeFile.startsWith('preview:') ? (
            <PreviewPanel port={activeFile.split(':')[1]} />
          ) : activeFile.endsWith('.ipynb') ? (
            <NotebookTab filePath={activeFile} />
          ) : activeFile === 'git-graph' ? (
            <GitGraphPanel />
          ) : activeFile.startsWith('git-diff:') ? (
            <div className="w-full h-full relative bg-[#1e1e1e]">
              {loadingDiff ? (
                <div className="flex flex-col justify-center items-center h-full text-gray-500 text-xs">
                  <span className="animate-pulse">Loading diff views...</span>
                </div>
              ) : (
                <DiffEditor
                  height="100%"
                  width="100%"
                  theme={theme}
                  original={diffOriginal}
                  modified={diffModified}
                  language={activeFile.substring('git-diff:'.length).split('.').pop()?.toLowerCase() || 'javascript'}
                  options={{
                    fontSize,
                    tabSize,
                    fontFamily: 'Fira Code, Consolas, Monaco, monospace',
                    minimap: { enabled: minimapVisible },
                    automaticLayout: true,
                    wordWrap: wordWrapMode,
                    lineNumbers: lineNumbersVisible ? 'on' : 'off',
                    scrollbar: {
                      verticalScrollbarSize: 10,
                      horizontalScrollbarSize: 10,
                    },
                  } as any}
                />
              )}
            </div>
          ) : (
            <div className="w-full h-full relative">
              <Editor
                height="100%"
                width="100%"
                theme={theme}
                loading={
                  <div className="flex flex-col justify-center items-center h-full bg-[#1e1e1e]">
                    <span className="text-xs text-gray-500 animate-pulse">Loading model language workers...</span>
                  </div>
                }
                options={{
                  fontSize,
                  tabSize,
                  fontFamily: 'Fira Code, Consolas, Monaco, monospace',
                  minimap: { enabled: minimapVisible },
                  automaticLayout: true,
                  wordWrap: wordWrapMode,
                  lineNumbers: lineNumbersVisible ? 'on' : 'off',
                  glyphMargin: true, // Enable glyph margin for breakpoint decorators (Module 79)
                  folding: true,
                  multiCursorModifier,
                  columnSelection: columnSelectionMode,
                  stickyScroll: { enabled: stickyScrollVisible },
                  scrollbar: {
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10,
                  },
                }}
                onMount={handleEditorDidMount}
              />
              {activeLineBlame && (
                <div className="absolute bottom-2 right-4 bg-[#202022]/90 backdrop-blur border border-[#3e3e3e]/40 px-2 py-0.5 rounded text-[10px] text-gray-400 select-none pointer-events-none z-10 font-sans shadow flex items-center space-x-1">
                  <span className="font-semibold text-blue-400">{activeLineBlame.author}</span>
                  <span className="text-gray-600">•</span>
                  <span className="italic text-gray-300">{activeLineBlame.summary}</span>
                  <span className="text-gray-600">•</span>
                  <span>{new Date(activeLineBlame.time).toLocaleDateString()}</span>
                </div>
              )}

              {inlineAIWidget && inlineAIWidget.visible && (
                <div 
                  className="absolute bg-[#1c1c1f]/95 backdrop-blur border border-[#3c3c3c] rounded-xl shadow-2xl p-3 z-50 flex flex-col space-y-2 select-text w-80 font-sans text-xs"
                  style={{ 
                    top: `${inlineAIWidget.top + inlineAIWidget.height + 8}px`,
                    left: `${Math.min(inlineAIWidget.left + 50, 450)}px` 
                  }}
                >
                  <div className="flex items-center space-x-1.5 text-purple-400 font-semibold mb-0.5">
                    <Sparkles size={13} className="animate-pulse" />
                    <span>Inline Edit (Ctrl+K)</span>
                  </div>
                  <div className="flex space-x-1.5 items-center">
                    <input
                      type="text"
                      value={inlineAIPrompt}
                      onChange={(e) => setInlineAIPrompt(e.target.value)}
                      placeholder="Ask AI to edit this code..."
                      className="flex-1 bg-[#141416] border border-[#2d2d2d] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
                      disabled={inlineAILoading}
                      onKeyDown={async (e) => {
                        if (e.key === 'Escape') {
                          setInlineAIWidget(null);
                        } else if (e.key === 'Enter') {
                          if (!inlineAIPrompt.trim()) return;
                          setInlineAILoading(true);
                          try {
                            const editor = editorRef.current;
                            if (editor && activeWorkspace) {
                              const selection = inlineAIWidget.selection;
                              let codeToEdit = '';
                              let range = selection;

                              if (selection && !selection.isEmpty()) {
                                codeToEdit = editor.getModel().getValueInRange(selection);
                              } else {
                                const lineContent = editor.getModel().getLineContent(inlineAIWidget.lineNumber);
                                codeToEdit = lineContent;
                                range = new monacoRef.current.Range(
                                  inlineAIWidget.lineNumber,
                                  1,
                                  inlineAIWidget.lineNumber,
                                  lineContent.length + 1
                                );
                              }

                              const ext = activeFile.split('.').pop()?.toLowerCase() || '';

                              const res = await api.post(`/workspaces/${activeWorkspace._id}/ai/rewrite`, {
                                prompt: inlineAIPrompt,
                                code: codeToEdit,
                                languageId: ext
                              });

                              const newCode = res.data.code;

                              editor.executeEdits('inline-ai', [
                                {
                                  range,
                                  text: newCode,
                                  forceMoveMarkers: true
                                }
                              ]);

                              setInlineAIWidget(null);
                            }
                          } catch (err) {
                            alert('Inline edit failed.');
                          } finally {
                            setInlineAILoading(false);
                          }
                        }
                      }}
                      autoFocus
                    />
                    {inlineAILoading && (
                      <span className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-500 select-none">
                    <span>Press <kbd className="bg-[#2d2d2d] px-1 rounded text-gray-400">Esc</kbd> to cancel</span>
                    <span>Press <kbd className="bg-[#2d2d2d] px-1 rounded text-gray-400">Enter</kbd> to edit</span>
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Layers className="text-gray-600 mb-3" size={32} />
            <p className="text-gray-400 text-xs">No files open in this pane.</p>
            <p className="text-[10px] text-gray-600 mt-1">Drag tabs here or select files from the sidebar explorer.</p>
          </div>
        )}
      </div>

      {/* DRAG-TO-SPLIT OVERLAY TARGETS */}
      {isDragOver && (
        <div 
          className="absolute inset-0 bg-blue-500/5 z-30 pointer-events-auto"
          onDragLeave={handleDragLeave}
        >
          {/* Left Zone */}
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDropOnZone(e, 'left')}
            className="absolute left-0 top-0 bottom-0 w-1/4 bg-blue-500/0 hover:bg-blue-500/20 border-r border-dashed border-blue-500/40 transition-colors flex items-center justify-center text-blue-400"
          >
            <span className="text-[9px] font-bold uppercase rotate-90">Split Left</span>
          </div>

          {/* Right Zone */}
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDropOnZone(e, 'right')}
            className="absolute right-0 top-0 bottom-0 w-1/4 bg-blue-500/0 hover:bg-blue-500/20 border-l border-dashed border-blue-500/40 transition-colors flex items-center justify-center text-blue-400"
          >
            <span className="text-[9px] font-bold uppercase -rotate-90">Split Right</span>
          </div>

          {/* Top Zone */}
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDropOnZone(e, 'top')}
            className="absolute left-1/4 right-1/4 top-0 h-1/4 bg-blue-500/0 hover:bg-blue-500/20 border-b border-dashed border-blue-500/40 transition-colors flex items-center justify-center text-blue-400"
          >
            <span className="text-[9px] font-bold uppercase">Split Top</span>
          </div>

          {/* Bottom Zone */}
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDropOnZone(e, 'bottom')}
            className="absolute left-1/4 right-1/4 bottom-0 h-1/4 bg-blue-500/0 hover:bg-blue-500/20 border-t border-dashed border-blue-500/40 transition-colors flex items-center justify-center text-blue-400"
          >
            <span className="text-[9px] font-bold uppercase">Split Bottom</span>
          </div>
        </div>
      )}

      {findOpen && (
        <FindReplaceWidget 
          editor={editorRef.current} 
          onClose={() => setFindOpen(false)} 
        />
      )}
    </div>
  );
}
