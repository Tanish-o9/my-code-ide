import { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { Workspace } from '../workspaces/workspace.model';

const execAsync = promisify(exec);

export class DockerController {
  
  /**
   * Helper to execute a command and parse JSON-Lines.
   */
  private static async runJsonListCmd(cmd: string): Promise<any[]> {
    try {
      const { stdout } = await execAsync(cmd);
      return stdout
        .trim()
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return { raw: line };
          }
        });
    } catch (err: any) {
      console.warn(`[DockerController] Command failed: ${cmd}`, err.message);
      return [];
    }
  }

  /**
   * Fetch all containers.
   */
  public static async getContainers(req: Request, res: Response): Promise<void> {
    try {
      const containers = await DockerController.runJsonListCmd(
        'docker ps -a --format "{\\\"id\\\":\\\"{{.ID}}\\\",\\\"names\\\":\\\"{{.Names}}\\\",\\\"image\\\":\\\"{{.Image}}\\\",\\\"state\\\":\\\"{{.State}}\\\",\\\"status\\\":\\\"{{.Status}}\\\",\\\"ports\\\":\\\"{{.Ports}}\\\"}"'
      );
      res.json(containers);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch containers.' });
    }
  }

  /**
   * Fetch all images.
   */
  public static async getImages(req: Request, res: Response): Promise<void> {
    try {
      const images = await DockerController.runJsonListCmd(
        'docker images --format "{\\\"id\\\":\\\"{{.ID}}\\\",\\\"repository\\\":\\\"{{.Repository}}\\\",\\\"tag\\\":\\\"{{.Tag}}\\\",\\\"size\\\":\\\"{{.Size}}\\\",\\\"created\\\":\\\"{{.CreatedAt}}\\\"}"'
      );
      res.json(images);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch images.' });
    }
  }

  /**
   * Fetch all volumes.
   */
  public static async getVolumes(req: Request, res: Response): Promise<void> {
    try {
      const volumes = await DockerController.runJsonListCmd(
        'docker volume ls --format "{\\\"name\\\":\\\"{{.Name}}\\\",\\\"driver\\\":\\\"{{.Driver}}\\\",\\\"scope\\\":\\\"{{.Scope}}\\\"}"'
      );
      res.json(volumes);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch volumes.' });
    }
  }

  /**
   * Fetch all networks.
   */
  public static async getNetworks(req: Request, res: Response): Promise<void> {
    try {
      const networks = await DockerController.runJsonListCmd(
        'docker network ls --format "{\\\"id\\\":\\\"{{.ID}}\\\",\\\"name\\\":\\\"{{.Name}}\\\",\\\"driver\\\":\\\"{{.Driver}}\\\",\\\"scope\\\":\\\"{{.Scope}}\\\"}"'
      );
      res.json(networks);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch networks.' });
    }
  }

  /**
   * Control container state (start, stop, restart, delete).
   */
  public static async controlContainer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { action } = req.body; // 'start' | 'stop' | 'restart' | 'delete'

      if (!['start', 'stop', 'restart', 'delete'].includes(action)) {
        res.status(400).json({ error: 'Invalid action parameter.' });
        return;
      }

      let cmd = `docker ${action} ${id}`;
      if (action === 'delete') {
        cmd = `docker rm -f ${id}`;
      }

      await execAsync(cmd);
      res.json({ success: true, message: `Container ${action}ed successfully.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to control container.' });
    }
  }

  /**
   * Get container logs.
   */
  public static async getContainerLogs(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { stdout } = await execAsync(`docker logs --tail 200 ${id}`);
      res.json({ logs: stdout });
    } catch (err: any) {
      res.json({ logs: err.stderr || err.stdout || `Failed to fetch logs: ${err.message}` });
    }
  }

  /**
   * Pull an image from registry.
   */
  public static async pullImage(req: Request, res: Response): Promise<void> {
    try {
      const { imageName } = req.body;
      if (!imageName) {
        res.status(400).json({ error: 'Image name is required.' });
        return;
      }

      await execAsync(`docker pull ${imageName}`);
      res.json({ success: true, message: `Image ${imageName} pulled successfully.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to pull image.' });
    }
  }

  /**
   * Build an image from workspace Dockerfile.
   */
  public static async buildImage(req: Request, res: Response): Promise<void> {
    try {
      const { workspaceId } = req.params as any;
      const { tag, dockerfilePath } = req.body;

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
      }

      const cwd = path.resolve(workspace.storagePath);
      const file = dockerfilePath ? path.resolve(cwd, dockerfilePath) : path.resolve(cwd, 'Dockerfile');

      if (!fs.existsSync(file)) {
        res.status(404).json({ error: `Dockerfile not found at path: ${file}` });
        return;
      }

      const buildTag = tag || 'custom-build:latest';
      exec(`docker build -f "${file}" -t ${buildTag} "${cwd}"`, (err, stdout, stderr) => {
        if (err) {
          console.error(`[DockerController] Image build failed:`, stderr || err.message);
        } else {
          console.log(`[DockerController] Image build completed successfully: ${buildTag}`);
        }
      });

      res.json({ success: true, message: `Docker image build triggered for ${buildTag}.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to build image.' });
    }
  }

  /**
   * Compose actions (up, down).
   */
  public static async composeAction(req: Request, res: Response): Promise<void> {
    try {
      const { workspaceId } = req.params as any;
      const { action } = req.body;

      if (!['up', 'down'].includes(action)) {
        res.status(400).json({ error: 'Invalid compose action.' });
        return;
      }

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
      }

      const cwd = path.resolve(workspace.storagePath);
      const composeFile = fs.existsSync(path.join(cwd, 'docker-compose.yml'))
        ? 'docker-compose.yml'
        : (fs.existsSync(path.join(cwd, 'compose.yaml')) ? 'compose.yaml' : null);

      if (!composeFile) {
        res.status(404).json({ error: 'No docker-compose.yml or compose.yaml found in workspace root.' });
        return;
      }

      const cmd = action === 'up' ? 'docker compose up -d' : 'docker compose down';
      exec(cmd, { cwd }, (err, stdout, stderr) => {
        if (err) {
          console.error(`[DockerController] Compose ${action} failed:`, stderr || err.message);
        } else {
          console.log(`[DockerController] Compose ${action} completed.`);
        }
      });

      res.json({ success: true, message: `Docker Compose ${action} triggered.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Compose operation failed.' });
    }
  }
}
