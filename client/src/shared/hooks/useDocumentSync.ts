import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { getCollabSocket } from '../lib/socket';

interface UseDocumentSyncProps {
  workspaceId: string;
  filePath: string;
  editor: any; // Monaco Editor instance
  onSever?: () => void;
}

// Native browser Base64 converters to avoid Node.js Buffer polyfills in Vite
function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = '';
  const len = arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return window.btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function useDocumentSync({ workspaceId, filePath, editor, onSever }: UseDocumentSyncProps) {
  const bindingRef = useRef<MonacoBinding | null>(null);

  useEffect(() => {
    if (!editor || !workspaceId || !filePath) return;

    const socket = getCollabSocket();
    if (!socket.connected) {
      socket.connect();
    }

    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('monaco');
    const model = editor.getModel();

    if (!model) return;

    // 1. Bind Yjs text type directly to Monaco Editor Model
    const binding = new MonacoBinding(ytext, model, new Set([editor]));
    bindingRef.current = binding;

    // 2. Join the document sync room
    socket.emit('sync:join', { workspaceId, filePath });

    // 3. Initiate Yjs Sync Handshake
    const localVector = Y.encodeStateVector(ydoc);
    socket.emit('yjs:sync-step-1', {
      workspaceId,
      filePath,
      stateVector: uint8ArrayToBase64(localVector),
    });

    // 4. Handle sync step 1 response from server
    const handleSyncStep1 = (data: { filePath: string; stateVector: string }) => {
      if (data.filePath !== filePath) return;
      const serverVector = base64ToUint8Array(data.stateVector);
      const missingUpdate = Y.encodeStateAsUpdate(ydoc, serverVector);
      socket.emit('yjs:update', {
        workspaceId,
        filePath,
        update: uint8ArrayToBase64(missingUpdate),
      });
    };

    // 5. Handle step 2 updates from server
    const handleSyncStep2 = (data: { filePath: string; update: string }) => {
      if (data.filePath !== filePath) return;
      Y.applyUpdate(ydoc, base64ToUint8Array(data.update));
    };

    // 6. Handle incremental remote updates
    const handleRemoteUpdate = (data: { filePath: string; update: string }) => {
      if (data.filePath !== filePath) return;
      Y.applyUpdate(ydoc, base64ToUint8Array(data.update), 'remote');
    };

    // Handle out-of-band file deletion room severance
    const handleSyncSever = (data: { filePath: string }) => {
      if (data.filePath === filePath && onSever) {
        onSever();
      }
    };

    socket.on('yjs:sync-step-1', handleSyncStep1);
    socket.on('yjs:sync-step-2', handleSyncStep2);
    socket.on('yjs:update', handleRemoteUpdate);
    socket.on('sync:sever', handleSyncSever);

    // 7. Track local Y.Doc updates and stream to server
    const handleLocalUpdate = (update: Uint8Array, origin: any) => {
      if (origin !== 'remote') {
        socket.emit('yjs:update', {
          workspaceId,
          filePath,
          update: uint8ArrayToBase64(update),
        });
      }
    };
    ydoc.on('update', handleLocalUpdate);

    // 8. Track local cursor and selection edits, throttled to 75ms (Module 48)
    let lastEmitTime = 0;
    const emitCursor = (position: any, selection: any) => {
      const now = Date.now();
      if (now - lastEmitTime > 75) {
        lastEmitTime = now;
        socket.emit('cursor:move', {
          workspaceId,
          filePath,
          position: position ? { lineNumber: position.lineNumber, column: position.column } : null,
          selection: selection ? {
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn,
          } : null,
        });
      }
    };

    const cursorListener = editor.onDidChangeCursorPosition((e: any) => {
      emitCursor(e.position, editor.getSelection());
    });

    const selectionListener = editor.onDidChangeCursorSelection((e: any) => {
      emitCursor(editor.getPosition(), e.selection);
    });

    // 9. Cleanup connection listeners on unmount or file change
    return () => {
      cursorListener.dispose();
      selectionListener.dispose();
      
      socket.off('yjs:sync-step-1', handleSyncStep1);
      socket.off('yjs:sync-step-2', handleSyncStep2);
      socket.off('yjs:update', handleRemoteUpdate);
      socket.off('sync:sever', handleSyncSever);

      ydoc.off('update', handleLocalUpdate);

      // Signal cursor exit
      socket.emit('cursor:move', {
        workspaceId,
        filePath,
        position: null,
        selection: null,
      });

      socket.emit('sync:leave', { workspaceId, filePath });
      
      binding.destroy();
      bindingRef.current = null;
      ydoc.destroy();
    };
  }, [editor, workspaceId, filePath]);
}
