import { Router, Response } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireWorkspaceAccess, WorkspaceRequest } from '../../middleware/workspace-auth.middleware';
import http from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = Router();

/**
 * Native streaming reverse proxy to forward traffic to container ports securely.
 */
const proxyPortRequest = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { workspaceId, port } = req.params;
    const workspace = req.workspace;

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const containerName = `cloud-ide-ws-${workspaceId}`;
    let targetHost = '127.0.0.1';

    // Verify container and resolve bridge network IP address
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
      try {
        const { stdout } = await execAsync(`docker inspect -f "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}" ${containerName}`);
        const ip = stdout.trim();
        if (ip) {
          targetHost = ip;
        }
      } catch (err) {
        console.error('[PortForward/Proxy] Failed to inspect IP address:', err);
      }
    }

    // Resolve request path and queries
    // req.params[0] contains the matched wildcard (*) path
    const pathSuffix = req.params[0] || '';
    const queryStr = req.url.split('?')[1] || '';
    const path = '/' + pathSuffix + (queryStr ? '?' + queryStr : '');

    // Setup streaming proxy request
    const proxyReq = http.request(
      {
        host: targetHost,
        port: parseInt(port, 10),
        path,
        method: req.method,
        headers: {
          ...req.headers,
          host: `${targetHost}:${port}`,
        },
      },
      (proxyRes) => {
        res.status(proxyRes.statusCode || 200);
        res.set(proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      }
    );

    proxyReq.on('error', (err) => {
      console.error(`[PortForward/Proxy] Connection failed to ${targetHost}:${port}:`, err.message);
      res.status(502).json({ 
        error: `Bad Gateway: Target port ${port} is not listening inside the container.` 
      });
    });

    // Pipe request body into proxy request
    req.pipe(proxyReq, { end: true });
  } catch (err: any) {
    console.error('[PortForward/Proxy] Failed:', err);
    res.status(500).json({ error: 'Internal proxy error' });
  }
};

// All routes require auth token validation first
router.use(authMiddleware as any);

// Catch wildcard route and stream to container port
router.all('/:workspaceId/preview/:port*', requireWorkspaceAccess('editor') as any, proxyPortRequest as any);

export default router;
