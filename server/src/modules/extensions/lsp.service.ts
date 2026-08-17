import { spawn, ChildProcess } from 'child_process';
import { Namespace, Socket } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { Workspace } from '../workspaces/workspace.model';

class LSPMessageReader {
  private buffer = '';
  private onMessage: (msg: any) => void;

  constructor(onMessage: (msg: any) => void) {
    this.onMessage = onMessage;
  }

  public append(chunk: string) {
    this.buffer += chunk;
    this.process();
  }

  private process() {
    while (true) {
      const headerIndex = this.buffer.indexOf('Content-Length: ');
      if (headerIndex === -1) break;

      const headerEnd = this.buffer.indexOf('\r\n\r\n', headerIndex);
      if (headerEnd === -1) break;

      const lengthStr = this.buffer.substring(headerIndex + 16, headerEnd);
      const contentLength = parseInt(lengthStr, 10);
      if (isNaN(contentLength)) {
        this.buffer = this.buffer.substring(headerEnd + 4);
        continue;
      }

      const messageStart = headerEnd + 4;
      if (this.buffer.length < messageStart + contentLength) {
        break;
      }

      const jsonStr = this.buffer.substring(messageStart, messageStart + contentLength);
      this.buffer = this.buffer.substring(messageStart + contentLength);

      try {
        const msg = JSON.parse(jsonStr);
        this.onMessage(msg);
      } catch (err) {
        console.error('[LSPReader] Failed to parse message JSON:', err);
      }
    }
  }
}

export class LSPService {
  private static sessions = new Map<string, { process: ChildProcess; reader: LSPMessageReader; languageId: string }>();
  private static io: Namespace | null = null;

  public static setIoInstance(io: Namespace) {
    this.io = io;
  }

  public static async startSession(
    workspaceId: string,
    sessionId: string,
    languageId: string,
    socket: Socket
  ): Promise<void> {
    if (this.sessions.has(sessionId)) {
      console.warn(`[LSPService] Session ${sessionId} already exists.`);
      return;
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    let cmd = '';
    let args: string[] = [];

    // Map languageId to executable and stdio arguments
    switch (languageId) {
      case 'python':
        cmd = 'pylsp';
        break;
      case 'typescript':
      case 'javascript':
        cmd = 'typescript-language-server';
        args = ['--stdio'];
        break;
      case 'cpp':
      case 'c':
        cmd = 'clangd';
        break;
      case 'go':
        cmd = 'gopls';
        break;
      case 'rust':
        cmd = 'rust-analyzer';
        break;
      case 'java':
        cmd = 'jdtls';
        break;
      case 'php':
        cmd = 'intelephense';
        args = ['--stdio'];
        break;
      default:
        throw new Error(`Unsupported language server for: ${languageId}`);
    }

    const resolvedCwd = path.resolve(workspace.storagePath);
    console.log(`[LSPService] Spawning ${cmd} ${args.join(' ')} at ${resolvedCwd} for session ${sessionId}`);

    // Spawn process locally (or inside container if preferred, but local fallback is the standard)
    const proc = spawn(cmd, args, {
      cwd: resolvedCwd,
      env: { ...process.env }
    });

    // Create JSON-RPC message reader
    const reader = new LSPMessageReader((msg) => {
      // Emit parsed JSON-RPC message to client
      socket.emit('lsp:message', { sessionId, message: msg });
    });

    this.sessions.set(sessionId, { process: proc, reader, languageId });

    // Stream process stdout to reader
    proc.stdout?.on('data', (chunk) => {
      reader.append(chunk.toString('utf8'));
    });

    // Stream process stderr for diagnostics/warnings
    proc.stderr?.on('data', (chunk) => {
      socket.emit('lsp:stderr', { sessionId, message: chunk.toString('utf8') });
    });

    proc.on('close', (code) => {
      console.log(`[LSPService:${languageId}] Process closed with code: ${code}`);
      socket.emit('lsp:closed', { sessionId, code });
      this.sessions.delete(sessionId);
    });

    proc.on('error', (err) => {
      console.error(`[LSPService:${languageId}] Process error:`, err);
      socket.emit('lsp:error', { sessionId, error: err.message });
      this.sessions.delete(sessionId);
    });
  }

  public static handleMessage(sessionId: string, message: any): void {
    const session = this.sessions.get(sessionId);
    if (session && session.process.stdin?.writable) {
      const json = JSON.stringify(message);
      const payload = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
      session.process.stdin.write(payload, 'utf8');
    } else {
      console.warn(`[LSPService] Failed to write message, stdin not writable for session ${sessionId}`);
    }
  }

  public static closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.process.kill();
      this.sessions.delete(sessionId);
      console.log(`[LSPService] Killed session process: ${sessionId}`);
    }
  }
}
