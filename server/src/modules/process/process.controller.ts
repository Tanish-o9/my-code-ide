import { Response } from 'express';
import { WorkspaceRequest } from '../../middleware/workspace-auth.middleware';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execAsync = promisify(exec);

/**
 * Lists processes running inside the workspace container or local directory.
 */
export const listProcesses = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace;
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const containerName = `cloud-ide-ws-${workspace._id}`;
    const isWin = os.platform() === 'win32';

    // 1. Check if Docker container is running
    let useDocker = false;
    try {
      const { stdout } = await execAsync(`docker ps --filter "name=${containerName}" --format "{{.Names}}"`);
      if (stdout.trim() === containerName) {
        useDocker = true;
      }
    } catch (err) {
      // Docker offline or command failed
    }

    const processList: Array<{ pid: number; name: string; cmd: string }> = [];

    if (useDocker) {
      try {
        // Execute docker top inside container to read processes
        const { stdout } = await execAsync(`docker top ${containerName}`);
        const lines = stdout.split('\n').filter((l) => l.trim());
        
        // Skip header line
        if (lines.length > 1) {
          const headers = lines[0].split(/\s+/).filter(Boolean);
          const pidIdx = headers.indexOf('PID');
          const cmdIdx = headers.indexOf('CMD') !== -1 ? headers.indexOf('CMD') : headers.indexOf('COMMAND');

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(/\s+/).filter(Boolean);
            if (cols.length > Math.max(pidIdx, cmdIdx)) {
              const pid = parseInt(cols[pidIdx], 10);
              const cmd = cols.slice(cmdIdx).join(' ');
              const name = cmd.split('/').pop()?.split(' ').shift() || cmd;
              processList.push({ pid, name, cmd });
            }
          }
        }
      } catch (err: any) {
        console.error('[Process/List/Docker] Failed:', err);
      }
    } else {
      // 2. Fallback: Host OS execution lists
      try {
        if (isWin) {
          const { stdout } = await execAsync('wmic process get processid,caption,commandline /format:csv');
          const lines = stdout.split('\n').filter((l) => l.trim());
          for (const line of lines) {
            const parts = line.split(',');
            if (parts.length >= 3 && !parts[1].startsWith('Caption')) {
              const name = parts[1];
              const cmd = parts[2];
              const pid = parseInt(parts[3] || parts[parts.length - 1], 10);
              // Filter to commands containing workspace storage path
              const storageClean = workspace.storagePath.replace(/\\/g, '/');
              const cmdClean = cmd.replace(/\\/g, '/');
              if (cmdClean.includes(storageClean) && !cmdClean.includes('wmic')) {
                processList.push({ pid, name, cmd });
              }
            }
          }
        } else {
          const { stdout } = await execAsync('ps -eo pid,comm,args');
          const lines = stdout.split('\n').filter((l) => l.trim());
          for (let i = 1; i < lines.length; i++) {
            const match = lines[i].trim().match(/^(\d+)\s+([^\s]+)\s+(.+)$/);
            if (match) {
              const pid = parseInt(match[1], 10);
              const name = match[2];
              const cmd = match[3];
              if (cmd.includes(workspace.storagePath) && !cmd.includes('ps -eo')) {
                processList.push({ pid, name, cmd });
              }
            }
          }
        }
      } catch (err) {
        console.error('[Process/List/Host] Failed:', err);
      }
    }

    res.status(200).json(processList);
  } catch (err: any) {
    console.error('[Process/List] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Kills a process by PID inside the container or host fallback (with scope verification).
 */
export const killProcess = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { pid } = req.body;
    const workspace = req.workspace;

    if (!pid) {
      res.status(400).json({ error: 'Process PID is required' });
      return;
    }

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const containerName = `cloud-ide-ws-${workspace._id}`;
    
    // Check if Docker container is running
    let useDocker = false;
    try {
      const { stdout } = await execAsync(`docker ps --filter "name=${containerName}" --format "{{.Names}}"`);
      if (stdout.trim() === containerName) {
        useDocker = true;
      }
    } catch (err) {
      // Docker offline
    }

    if (useDocker) {
      // Docker execution: kill -9 PID executes strictly inside the container
      // If client sends host PID, container's namespace isolates it safely.
      console.log(`[Process/Kill] Terminating PID ${pid} inside container ${containerName}`);
      await execAsync(`docker exec ${containerName} kill -9 ${pid}`);
    } else {
      // Host execution fallback: MUST verify PID belongs to workspace context first!
      const isWin = os.platform() === 'win32';
      let belongsToWorkspace = false;

      try {
        if (isWin) {
          const { stdout } = await execAsync(`wmic process where "ProcessId=${pid}" get CommandLine`);
          const storageClean = workspace.storagePath.replace(/\\/g, '/');
          const cleanOutput = stdout.replace(/\\/g, '/');
          if (cleanOutput.includes(storageClean)) {
            belongsToWorkspace = true;
          }
        } else {
          const { stdout } = await execAsync(`ps -p ${pid} -o args=`);
          if (stdout.includes(workspace.storagePath)) {
            belongsToWorkspace = true;
          }
        }
      } catch (err) {
        // Failed query
      }

      if (!belongsToWorkspace) {
        res.status(403).json({ error: 'Access denied: Target process is outside workspace scope' });
        return;
      }

      console.log(`[Process/Kill] Terminating host fallback PID ${pid}`);
      if (isWin) {
        await execAsync(`taskkill /F /PID ${pid}`);
      } else {
        await execAsync(`kill -9 ${pid}`);
      }
    }

    res.status(200).json({ message: `Process ${pid} terminated` });
  } catch (err: any) {
    console.error('[Process/Kill] Error:', err);
    res.status(500).json({ error: 'Failed to terminate process' });
  }
};
