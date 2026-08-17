import * as pty from 'node-pty';
import os from 'os';
import path from 'path';
import { WorkspaceRunnerService } from '../workspaces/workspace-runner.service';
import { Workspace } from '../workspaces/workspace.model';
import { decrypt } from '../../utils/crypto';

// In-memory registry of active terminal PTY sessions
export interface TerminalSession {
  id: string;
  workspaceId: string;
  pty: pty.IPty;
  scrollbackBuffer: string[];
  lastActivityAt: Date;
}

const sessions = new Map<string, TerminalSession>();
const spawnHistory = new Map<string, number[]>();
let ioInstance: any = null;

export const setIoInstance = (io: any) => {
  ioInstance = io;
};

export class TerminalService {
  /**
   * Get active terminal session registry size or retrieve session by ID
   */
  public static getSession(sessionId: string): TerminalSession | null {
    const session = sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
      // Touch workspace keep-alive
      WorkspaceRunnerService.touch(session.workspaceId);
    }
    return session || null;
  }

  /**
   * List session IDs currently active for a specific workspace.
   */
  public static getWorkspaceSessions(workspaceId: string): TerminalSession[] {
    return Array.from(sessions.values()).filter((s) => s.workspaceId === workspaceId);
  }

  /**
   * Spawn terminal process (pty) inside Docker container or host fallback
   */
  public static async createSession(
    workspaceId: string,
    sessionId: string,
    cols: number = 80,
    rows: number = 24,
    customCommand?: string
  ): Promise<TerminalSession> {
    // Rate-limiting terminal creations: max 30 terminals per minute per workspace
    const now = Date.now();
    const timestamps = spawnHistory.get(workspaceId) || [];
    const recent = timestamps.filter(t => now - t < 60000);
    if (recent.length >= 30) {
      throw new Error('Rate limit exceeded. Maximum 30 terminal session creations per minute.');
    }
    recent.push(now);
    spawnHistory.set(workspaceId, recent);

    // 1. Fetch workspace storage parameters
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // 2. Ensure container is active (auto-resumes if suspended)
    const containerName = await WorkspaceRunnerService.startRunner(workspaceId, workspace.storagePath);

    // 3. Retrieve environment variables
    const customEnv: Record<string, string> = {};
    try {
      const { WorkspaceEnv } = require('../env/env.model');
      const envVars = await WorkspaceEnv.find({ workspaceId });
      for (const envVar of envVars) {
        customEnv[envVar.key] = decrypt(envVar.value);
      }
    } catch (err) {
      // Graceful fallback if model is not loaded yet
    }

    let ptyProcess: pty.IPty;
    const isWindowsHost = os.platform() === 'win32';

    // Resolve shell and arguments (always launch real OS shell directly on host)
    const shell = isWindowsHost ? 'powershell.exe' : (os.platform() === 'darwin' ? 'zsh' : 'bash');
    const shellArgs: string[] = [];

    const resolvedCwd = path.resolve(workspace.storagePath);
    
    // Ensure target directory exists on filesystem
    if (!require('fs').existsSync(resolvedCwd)) {
      try {
        require('fs').mkdirSync(resolvedCwd, { recursive: true });
      } catch (e) {
        console.error('[TerminalService] Failed to create workspace folder:', e);
      }
    }

    console.log(`[TerminalService] Spawning real host PTY shell (${shell}) at cwd: ${resolvedCwd}`);

    try {
      ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: resolvedCwd,
        env: {
          ...process.env,
          ...customEnv,
        },
        useConpty: false // Force winpty on Windows to avoid AttachConsole/CreateProcess crashes
      });
    } catch (err) {
      console.warn('[TerminalService] ConPTY spawn failed, falling back to winpty/legacy...', err);
      ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: resolvedCwd,
        env: {
          ...process.env,
          ...customEnv,
        },
        useConpty: false
      });
    }

    // Write customCommand directly to the process's stdin after initialization delay
    if (customCommand) {
      const bootDelay = isWindowsHost ? 850 : 250; // Give PowerShell a bit longer to boot up on Windows
      setTimeout(() => {
        try {
          console.log(`[TerminalService] Executing initial command on PTY stdin: ${customCommand}`);
          ptyProcess.write(`${customCommand}\r\n`);
        } catch (e) {
          console.error('[TerminalService] Failed to write customCommand to PTY stdin:', e);
        }
      }, bootDelay);
    }

    // 5. Create session object
    const session: TerminalSession = {
      id: sessionId,
      workspaceId,
      pty: ptyProcess,
      scrollbackBuffer: [],
      lastActivityAt: new Date(),
    };

    sessions.set(sessionId, session);

    // 6. Listen to process output events
    ptyProcess.onData((data) => {
      session.lastActivityAt = new Date();
      WorkspaceRunnerService.touch(workspaceId);

      // Cache rolling scrollback
      session.scrollbackBuffer.push(data);
      if (session.scrollbackBuffer.length > 1000) {
        session.scrollbackBuffer.shift();
      }

      // Stream output to connected clients in the session room
      if (ioInstance) {
        ioInstance.of('/ws/terminal').to(`session:${sessionId}`).emit('output', {
          sessionId,
          data,
        });
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[TerminalService] Shell session ${sessionId} exited (code: ${exitCode}, signal: ${signal})`);
      sessions.delete(sessionId);
      
      if (ioInstance) {
        ioInstance.of('/ws/terminal').to(`session:${sessionId}`).emit('exit', {
          sessionId,
          exitCode,
        });
      }
    });

    return session;
  }

  /**
   * Terminate a specific terminal process and clean up session
   */
  public static closeSession(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (session) {
      try {
        session.pty.kill();
      } catch (err) {
        // Safe check if process already exited
      }
      sessions.delete(sessionId);
      console.log(`[TerminalService] Closed terminal session: ${sessionId}`);
    }
  }

  /**
   * Terminate all terminal sessions for a workspace (e.g. on suspend or delete)
   */
  public static closeWorkspaceSessions(workspaceId: string): void {
    const wsSessions = this.getWorkspaceSessions(workspaceId);
    for (const session of wsSessions) {
      this.closeSession(session.id);
    }
  }
}
