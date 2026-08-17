import { getLspSocket } from '../../shared/lib/socket';
import { api } from '../../shared/lib/api';

export class LSPClient {
  private static socket = getLspSocket();
  private static sessions = new Map<string, { workspaceId: string; languageId: string; documentUris: Set<string> }>();
  private static pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private static seqCounter = 1;
  private static registeredLanguages = new Set<string>();

  public static initialize(workspaceId: string, languageId: string, filePath: string) {
    const socket = this.socket;
    if (!socket.connected) {
      socket.connect();
    }

    const sessionId = `${workspaceId}:${languageId}`;
    let session = this.sessions.get(sessionId);

    const fileUri = `file:///${filePath.replace(/\\/g, '/')}`;

    if (!session) {
      session = { workspaceId, languageId, documentUris: new Set() };
      this.sessions.set(sessionId, session);

      // Start backend LSP session
      socket.emit('lsp:start-session', { workspaceId, sessionId, languageId });

      // Send initialize request to LSP server
      setTimeout(() => {
        this.sendRequest(sessionId, 'initialize', {
          processId: null,
          rootPath: null,
          rootUri: `file:///workspace`,
          capabilities: {
            textDocument: {
              completion: { completionItem: { snippetSupport: true } },
              hover: {},
              definition: {},
              references: {},
              rename: {},
              signatureHelp: {},
              codeAction: {}
            }
          }
        });
      }, 500);
    }

    if (!session.documentUris.has(fileUri)) {
      session.documentUris.add(fileUri);
      // Notify file opened
      setTimeout(() => {
        this.sendNotification(sessionId, 'textDocument/didOpen', {
          textDocument: {
            uri: fileUri,
            languageId,
            version: 1,
            text: '' // content will be synced via didChange or initial setup
          }
        });
      }, 800);
    }

    this.registerMonacoProviders(languageId);
  }

  public static setupListeners(monaco: any) {
    const socket = this.socket;

    socket.off('lsp:message');
    socket.on('lsp:message', (data: { sessionId: string; message: any }) => {
      const { message } = data;
      if (!message) return;

      const { id, result, error, method, params } = message;

      if (id !== undefined) {
        // Resolve pending requests
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          if (error) {
            pending.reject(error);
          } else {
            pending.resolve(result);
          }
        }
      } else if (method === 'textDocument/publishDiagnostics') {
        // Handle publishing diagnostics (Module diagnostics support)
        const { uri, diagnostics } = params;
        const filePath = uri.replace('file:///', '');
        const model = monaco.editor.getModels().find((m: any) => m.uri.toString().endsWith(filePath));
        if (model) {
          const markers = diagnostics.map((d: any) => ({
            severity: d.severity === 1 ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
            message: d.message,
            startLineNumber: d.range.start.line + 1,
            startColumn: d.range.start.character + 1,
            endLineNumber: d.range.end.line + 1,
            endColumn: d.range.end.character + 1
          }));
          monaco.editor.setModelMarkers(model, 'lsp', markers);
        }
      }
    });
  }

  public static handleDocumentChange(workspaceId: string, languageId: string, filePath: string, content: string) {
    const sessionId = `${workspaceId}:${languageId}`;
    if (!this.sessions.has(sessionId)) return;

    const fileUri = `file:///${filePath.replace(/\\/g, '/')}`;
    this.sendNotification(sessionId, 'textDocument/didChange', {
      textDocument: { uri: fileUri, version: Date.now() },
      contentChanges: [{ text: content }]
    });
  }

  private static sendRequest(sessionId: string, method: string, params: any): Promise<any> {
    const id = this.seqCounter++;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.socket.emit('lsp:message', {
        sessionId,
        message: { jsonrpc: '2.0', id, method, params }
      });
    });
  }

  private static sendNotification(sessionId: string, method: string, params: any) {
    this.socket.emit('lsp:message', {
      sessionId,
      message: { jsonrpc: '2.0', method, params }
    });
  }

  private static registerMonacoProviders(languageId: string) {
    if (this.registeredLanguages.has(languageId)) return;
    this.registeredLanguages.add(languageId);

    const monaco = (window as any).monaco;
    if (!monaco) return;

    const getSessionId = () => {
      const workspaceId = (window as any).activeWorkspaceId || '';
      return `${workspaceId}:${languageId}`;
    };

    // Helper to get active file path relative or URI
    const getActiveFileUri = (model: any) => {
      return model.uri.toString();
    };

    // 1. Hover Provider
    monaco.languages.registerHoverProvider(languageId, {
      provideHover: async (model: any, position: any) => {
        const sessionId = getSessionId();
        try {
          const res = await this.sendRequest(sessionId, 'textDocument/hover', {
            textDocument: { uri: getActiveFileUri(model) },
            position: { line: position.lineNumber - 1, character: position.column - 1 }
          });
          if (!res || !res.contents) return null;
          return {
            contents: Array.isArray(res.contents)
              ? res.contents.map((c: any) => ({ value: typeof c === 'string' ? c : c.value }))
              : [{ value: typeof res.contents === 'string' ? res.contents : res.contents.value }]
          };
        } catch {
          return null;
        }
      }
    });

    // 2. Completion Provider
    monaco.languages.registerCompletionItemProvider(languageId, {
      triggerCharacters: ['.', ':', '(', '/'],
      provideCompletionItems: async (model: any, position: any) => {
        const sessionId = getSessionId();
        try {
          const res = await this.sendRequest(sessionId, 'textDocument/completion', {
            textDocument: { uri: getActiveFileUri(model) },
            position: { line: position.lineNumber - 1, character: position.column - 1 }
          });
          const items = Array.isArray(res) ? res : res?.items || [];
          const suggestions = items.map((item: any) => ({
            label: item.label,
            kind: item.kind ?? monaco.languages.CompletionItemKind.Property,
            detail: item.detail,
            documentation: item.documentation,
            insertText: item.insertText || item.label,
            range: undefined
          }));
          return { suggestions };
        } catch {
          return { suggestions: [] };
        }
      }
    });

    // 3. Definition Provider
    monaco.languages.registerDefinitionProvider(languageId, {
      provideDefinition: async (model: any, position: any) => {
        const sessionId = getSessionId();
        try {
          const res = await this.sendRequest(sessionId, 'textDocument/definition', {
            textDocument: { uri: getActiveFileUri(model) },
            position: { line: position.lineNumber - 1, character: position.column - 1 }
          });
          if (!res) return null;
          const locs = Array.isArray(res) ? res : [res];
          return locs.map((loc: any) => ({
            uri: monaco.Uri.parse(loc.uri),
            range: {
              startLineNumber: loc.range.start.line + 1,
              startColumn: loc.range.start.character + 1,
              endLineNumber: loc.range.end.line + 1,
              endColumn: loc.range.end.character + 1
            }
          }));
        } catch {
          return null;
        }
      }
    });

    // 4. Reference Provider
    monaco.languages.registerReferenceProvider(languageId, {
      provideReferences: async (model: any, position: any, context: any) => {
        const sessionId = getSessionId();
        try {
          const res = await this.sendRequest(sessionId, 'textDocument/references', {
            textDocument: { uri: getActiveFileUri(model) },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
            context: { includeDeclaration: context.includeDeclaration }
          });
          if (!res) return [];
          return res.map((loc: any) => ({
            uri: monaco.Uri.parse(loc.uri),
            range: {
              startLineNumber: loc.range.start.line + 1,
              startColumn: loc.range.start.character + 1,
              endLineNumber: loc.range.end.line + 1,
              endColumn: loc.range.end.character + 1
            }
          }));
        } catch {
          return [];
        }
      }
    });

    // 5. Rename Provider
    monaco.languages.registerRenameProvider(languageId, {
      provideRenameEdits: async (model: any, position: any, newName: string) => {
        const sessionId = getSessionId();
        try {
          const res = await this.sendRequest(sessionId, 'textDocument/rename', {
            textDocument: { uri: getActiveFileUri(model) },
            position: { line: position.lineNumber - 1, character: position.column - 1 },
            newName
          });
          if (!res || !res.changes) return null;
          const edits: any[] = [];
          for (const [uri, changes] of Object.entries(res.changes)) {
            const targetUri = monaco.Uri.parse(uri);
            const targetModel = monaco.editor.getModel(targetUri);
            if (targetModel) {
              (changes as any[]).forEach((change) => {
                edits.push({
                  resource: targetUri,
                  versionId: targetModel.getVersionId(),
                  textEdit: {
                    range: {
                      startLineNumber: change.range.start.line + 1,
                      startColumn: change.range.start.character + 1,
                      endLineNumber: change.range.end.line + 1,
                      endColumn: change.range.end.character + 1
                    },
                    text: change.newText
                  }
                });
              });
            }
          }
          return { edits };
        } catch {
          return null;
        }
      }
    });

    // 6. Inline Completions Provider (Ghost Text)
    if (monaco.languages.registerInlineCompletionsProvider) {
      monaco.languages.registerInlineCompletionsProvider(languageId, {
        provideInlineCompletions: async (model: any, position: any, context: any, token: any) => {
          let wId = '';
          for (const s of this.sessions.values()) {
            if (s.languageId === languageId) {
              wId = s.workspaceId;
              break;
            }
          }
          if (!wId) return null;

          const text = model.getValue();
          const offset = model.getOffsetAt(position);
          const prefix = text.substring(0, offset);
          const suffix = text.substring(offset);

          try {
            const res = await api.post(`/workspaces/${wId}/ai/complete`, {
              prefix,
              suffix,
              filePath: model.uri.path
            });
            if (res.data && res.data.suggestions && res.data.suggestions.length > 0) {
              return {
                items: res.data.suggestions.map((sug: string) => ({
                  insertText: sug,
                  range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
                }))
              };
            }
          } catch (err) {
            console.error('Failed to get inline completion:', err);
          }
          return null;
        },
        freeInlineCompletions: () => {}
      });
    }
  }
}
