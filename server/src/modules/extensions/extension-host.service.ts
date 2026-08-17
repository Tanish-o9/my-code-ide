import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import { Namespace } from 'socket.io';
import { ExtensionPermissionService } from './extension-permission.service';
import { FileSystemService } from '../filesystem/filesystem.service';
import { Workspace } from '../workspaces/workspace.model';
import { InstalledExtension } from './extension.model';

interface PendingRPC {
  resolve: (val: any) => void;
  reject: (err: any) => void;
}

export class ExtensionHostService {
  private static activeHosts = new Map<string, ChildProcess>();
  private static pendingRPCs = new Map<string, PendingRPC>();
  private static registeredCommands = new Map<string, string>(); // commandId -> extensionId
  private static statusBarItems = new Map<string, { id: string; text: string; tooltip?: string; extensionId: string }>();
  private static io: Namespace | null = null;
  private static seqCounter = 1;
  private static extensionWorkspaces = new Map<string, string>(); // extensionId -> workspaceId

  public static setIoInstance(io: Namespace) {
    this.io = io;
  }

  public static getRegisteredCommands() {
    return Array.from(this.registeredCommands.entries()).map(([id, extensionId]) => ({ id, extensionId }));
  }

  public static getStatusBarItems() {
    return Array.from(this.statusBarItems.values());
  }

  /**
   * Spawns an isolated Node.js process for a given extension.
   */
  public static async startHost(workspaceId: string, extensionId: string, entryPath: string): Promise<void> {
    if (this.activeHosts.has(extensionId)) {
      console.warn(`[ExtensionHost] Host for ${extensionId} is already running.`);
      return;
    }

    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found.');
    }

    // Runner script is adjacent in compiled code
    let runnerPath = path.join(__dirname, 'extension-host.js');
    if (!require('fs').existsSync(runnerPath)) {
      runnerPath = path.join(__dirname, 'extension-host.ts');
    }

    console.log(`[ExtensionHost] Spawning process for ${extensionId} using entry: ${entryPath}`);

    const child = fork(runnerPath, [], {
      execArgv: ['--max-old-space-size=128'], // Limit heap size to 128MB (Module 102)
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    this.activeHosts.set(extensionId, child);
    this.extensionWorkspaces.set(extensionId, workspaceId);

    // Capture standard output streams
    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      this.logToConsole(workspaceId, extensionId, 'stdout', text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      this.logToConsole(workspaceId, extensionId, 'stderr', text);
    });

    // Listen to IPC messages from child
    child.on('message', async (msg: any) => {
      if (!msg || typeof msg !== 'object') return;

      const { type, id, method, params, result, error } = msg;

      if (type === 'request') {
        // Child is making a request to the API server
        try {
          const res = await this.handleExtensionRequest(workspaceId, extensionId, method, params);
          child.send({ type: 'response', id, result: res });
        } catch (err: any) {
          child.send({ type: 'response', id, error: err.message || 'API request failed' });
        }
      } else if (type === 'response') {
        // Child responded to a request initiated by the server
        const key = `${extensionId}:${id}`;
        const pending = this.pendingRPCs.get(key);
        if (pending) {
          this.pendingRPCs.delete(key);
          if (error) {
            pending.reject(new Error(error));
          } else {
            pending.resolve(result);
          }
        }
      } else if (type === 'output') {
        this.logToConsole(workspaceId, extensionId, msg.category, msg.text);
      }
    });

    // Handle unexpected crash or exit
    child.on('exit', (code, signal) => {
      console.warn(`[ExtensionHost] Process for ${extensionId} exited. Code: ${code}, Signal: ${signal}`);
      this.activeHosts.delete(extensionId);
      this.cleanupExtensionContributions(extensionId, workspaceId);
      
      // Notify client
      if (this.io) {
        this.io.to(workspaceId).emit('extension:crashed', { extensionId, code, signal });
      }
    });

    // Trigger activation inside host process
    try {
      await this.sendRequest(extensionId, 'activate', { entryPath });
    } catch (err: any) {
      console.error(`[ExtensionHost] Failed to activate extension ${extensionId}:`, err);
      this.stopHost(extensionId, workspaceId);
      throw err;
    }
  }

  /**
   * Activates extensions matching a declared activation event if not already running.
   */
  public static async activateByEvent(workspaceId: string, eventName: string): Promise<void> {
    const installed = await InstalledExtension.find({ active: true });
    for (const ext of installed) {
      const matchesEvent = ext.manifest.activationEvents.includes(eventName) || ext.manifest.activationEvents.includes('*');
      if (matchesEvent && !this.activeHosts.has(ext.extensionId)) {
        console.log(`[ExtensionHost] Event "${eventName}" triggered lazy activation for: ${ext.extensionId}`);
        try {
          await this.startHost(workspaceId, ext.extensionId, ext.manifest.entryPath);
        } catch (err) {
          console.error(`[ExtensionHost] Failed lazy activation for ${ext.extensionId}:`, err);
        }
      }
    }
  }

  /**
   * Terminates the subprocess and cleans up registered contributions.
   */
  public static stopHost(extensionId: string, workspaceId: string): void {
    const child = this.activeHosts.get(extensionId);
    if (child) {
      console.log(`[ExtensionHost] Terminating process for ${extensionId}`);
      child.kill('SIGTERM');
      this.activeHosts.delete(extensionId);
    }
    this.extensionWorkspaces.delete(extensionId);
    this.cleanupExtensionContributions(extensionId, workspaceId);
  }

  /**
   * Executes a command registered by the extension.
   */
  public static async executeCommand(extensionId: string, commandId: string, args: any[] = []): Promise<any> {
    if (!this.activeHosts.has(extensionId)) {
      throw new Error(`Extension host for ${extensionId} is not running.`);
    }
    return this.sendRequest(extensionId, 'executeCommand', { commandId, args });
  }

  private static async sendRequest(extensionId: string, method: string, params: any): Promise<any> {
    const child = this.activeHosts.get(extensionId);
    if (!child) {
      throw new Error(`Extension host for ${extensionId} is not running.`);
    }

    const id = this.seqCounter++;
    const key = `${extensionId}:${id}`;

    return new Promise((resolve, reject) => {
      // Set up a call timeout to prevent hung handlers (Module 102)
      const timeout = setTimeout(() => {
        this.pendingRPCs.delete(key);
        reject(new Error(`RPC call ${method} to extension ${extensionId} timed out.`));
        
        // Terminate hung host process to free CPU/Memory (Module 102)
        const wsId = this.extensionWorkspaces.get(extensionId);
        if (wsId) {
          console.error(`[ExtensionHost] Killing hung extension ${extensionId} due to RPC timeout.`);
          this.stopHost(extensionId, wsId);
        }
      }, 5000);

      this.pendingRPCs.set(key, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });

      child.send({ type: 'request', id, method, params });
    });
  }

  private static async handleExtensionRequest(
    workspaceId: string,
    extensionId: string,
    method: string,
    params: any
  ): Promise<any> {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace context is invalid.');
    }

    if (method === 'commands.register') {
      const allowed = await ExtensionPermissionService.hasPermission(extensionId, 'commands:register');
      if (!allowed) throw new Error('Permission denied: commands:register');

      const { id } = params;
      this.registeredCommands.set(id, extensionId);
      
      if (this.io) {
        this.io.to(workspaceId).emit('extension:command-registered', { id, extensionId });
      }
      return { success: true };
    }

    if (method === 'workspace.readFile') {
      const allowed = await ExtensionPermissionService.hasPermission(extensionId, 'file:read');
      if (!allowed) throw new Error('Permission denied: file:read');

      const { filePath } = params;
      return FileSystemService.readFile(workspace.storagePath, filePath);
    }

    if (method === 'workspace.writeFile') {
      const allowed = await ExtensionPermissionService.hasPermission(extensionId, 'file:write');
      if (!allowed) throw new Error('Permission denied: file:write');

      const { filePath, content } = params;
      FileSystemService.writeFile(workspace.storagePath, filePath, content);
      return { success: true };
    }

    if (method === 'ui.createStatusBarItem') {
      const allowed = await ExtensionPermissionService.hasPermission(extensionId, 'ui:statusbar');
      if (!allowed) throw new Error('Permission denied: ui:statusbar');

      const { id, text, tooltip } = params;
      this.statusBarItems.set(id, { id, text, tooltip, extensionId });

      if (this.io) {
        this.io.to(workspaceId).emit('extension:statusbar-updated', Array.from(this.statusBarItems.values()));
      }
      return { success: true };
    }

    throw new Error(`Unsupported RPC API call: ${method}`);
  }

  private static logToConsole(workspaceId: string, extensionId: string, category: string, text: string) {
    if (this.io) {
      this.io.to(workspaceId).emit('extension:log', {
        extensionId,
        category,
        text,
        timestamp: new Date()
      });
    }
  }

  private static cleanupExtensionContributions(extensionId: string, workspaceId: string) {
    // Deregister commands
    for (const [cmdId, extId] of this.registeredCommands.entries()) {
      if (extId === extensionId) {
        this.registeredCommands.delete(cmdId);
      }
    }

    // Deregister status bar items
    for (const [itemId, item] of this.statusBarItems.entries()) {
      if (item.extensionId === extensionId) {
        this.statusBarItems.delete(itemId);
      }
    }

    if (this.io) {
      this.io.to(workspaceId).emit('extension:contributions-cleaned', {
        extensionId,
        commands: Array.from(this.registeredCommands.keys()),
        statusBarItems: Array.from(this.statusBarItems.values())
      });
    }
  }
}
