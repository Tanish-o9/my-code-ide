import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { Workspace } from '../workspaces/workspace.model';
import { WorkspaceRunnerService } from '../workspaces/workspace-runner.service';
import { DebugAdapterRegistry } from './debug-adapter.registry';

export interface DebugSession {
  sessionId: string;
  workspaceId: string;
  userId: string;
  adapterProcess: ChildProcess;
  parser: DAPParser;
  sockets: Set<string>;
  lastActivity: Date;
}

const activeSessions = new Map<string, DebugSession>();
let ioInstance: any = null;

export const setIoInstance = (io: any) => {
  ioInstance = io;
};

class DAPParser {
  private buffer = Buffer.alloc(0);
  private onMessage: (msg: any) => void;

  constructor(onMessage: (msg: any) => void) {
    this.onMessage = onMessage;
  }

  public append(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.parse();
  }

  private parse() {
    while (true) {
      const dataStr = this.buffer.toString('utf8');
      const match = dataStr.match(/^Content-Length:\s*(\d+)\r\n\r\n/i);
      if (!match) break;

      const contentLength = parseInt(match[1], 10);
      const headerLength = match[0].length;

      if (this.buffer.length < headerLength + contentLength) break;

      const jsonStr = this.buffer.toString('utf8', headerLength, headerLength + contentLength);
      this.buffer = this.buffer.subarray(headerLength + contentLength);

      try {
        const msg = JSON.parse(jsonStr);
        this.onMessage(msg);
      } catch (err) {
        console.error('[DAPParser] Failed to parse JSON message:', err);
      }
    }
  }
}

export class DebugAdapterService {
  /**
   * Retrieves active debug session.
   */
  public static getSession(sessionId: string): DebugSession | null {
    const session = activeSessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      WorkspaceRunnerService.touch(session.workspaceId);
    }
    return session || null;
  }

  /**
   * Check if workspace has any active debug sessions.
   */
  public static hasActiveSession(workspaceId: string): boolean {
    for (const session of activeSessions.values()) {
      if (session.workspaceId === workspaceId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Spawn debug adapter process inside container or host fallback.
   */
  public static async createSession(
    workspaceId: string,
    sessionId: string,
    adapterType: 'node' | 'python',
    userId: string
  ): Promise<DebugSession> {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const containerName = await WorkspaceRunnerService.startRunner(workspaceId, workspace.storagePath);
    const config = DebugAdapterRegistry.getConfig(adapterType);

    // Setup adapter environments if needed
    if (containerName && config.setupCommand) {
      try {
        const setupParts = config.setupCommand.split(' && ');
        for (const part of setupParts) {
          const setupArgs = ['exec', containerName, ...part.split(' ')];
          const setupProc = spawn('docker', setupArgs);
          await new Promise((resolve) => setupProc.on('close', resolve));
        }
      } catch (err) {
        console.error(`[DebugAdapterService] Failed to run adapter setupCommand:`, err);
      }
    }

    // Write helper file for node
    if (adapterType === 'node') {
      DebugAdapterRegistry.ensureNodeAdapterWritten(workspace.storagePath);
    }

    let adapterProcess: ChildProcess;

    if (containerName) {
      // Spawn inside container sandbox
      const execArgs = ['exec', '-i', containerName, config.command, ...config.args];
      console.log(`[DebugAdapterService] Spawning debug adapter in container: docker ${execArgs.join(' ')}`);
      adapterProcess = spawn('docker', execArgs);
    } else {
      // Spawn local fallback
      const localCwd = path.resolve(workspace.storagePath);
      let adapterCommand = config.command;
      if (adapterType === 'python' && workspace.settings.pythonPath) {
        adapterCommand = workspace.settings.pythonPath;
      }
      console.log(`[DebugAdapterService] Spawning fallback local debug adapter: ${adapterCommand} ${config.args.join(' ')}`);
      adapterProcess = spawn(adapterCommand, config.args, { cwd: localCwd });
    }

    const parser = new DAPParser((msg) => {
      // Touch activity timers
      session.lastActivity = new Date();
      WorkspaceRunnerService.touch(workspaceId);

      // Stream DAP frame back to client socket room
      if (ioInstance) {
        ioInstance.of('/ws/debug').to(`debug:${sessionId}`).emit('dap:message', msg);
      }
    });

    adapterProcess.stdout?.on('data', (chunk) => {
      parser.append(chunk);
    });

    adapterProcess.stderr?.on('data', (chunk) => {
      if (ioInstance) {
        ioInstance.of('/ws/debug').to(`debug:${sessionId}`).emit('dap:stderr', chunk.toString());
      }
    });

    adapterProcess.on('close', (code) => {
      console.log(`[DebugAdapterService] Debug session ${sessionId} closed with exit code: ${code}`);
      if (ioInstance) {
        ioInstance.of('/ws/debug').to(`debug:${sessionId}`).emit('dap:terminated');
      }
      activeSessions.delete(sessionId);
    });

    const session: DebugSession = {
      sessionId,
      workspaceId,
      userId,
      adapterProcess,
      parser,
      sockets: new Set<string>(),
      lastActivity: new Date(),
    };

    activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Terminate active debug adapter process and cleans session.
   */
  public static closeSession(sessionId: string) {
    const session = activeSessions.get(sessionId);
    if (session) {
      try {
        session.adapterProcess.kill();
      } catch (err) {
        // Safe check
      }
      activeSessions.delete(sessionId);
    }
  }

  /**
   * Clean all active debug sessions for a workspace.
   */
  public static closeWorkspaceSessions(workspaceId: string) {
    for (const session of activeSessions.values()) {
      if (session.workspaceId === workspaceId) {
        this.closeSession(session.sessionId);
      }
    }
  }
}
