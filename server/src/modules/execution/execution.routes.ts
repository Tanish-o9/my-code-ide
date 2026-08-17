import { Router } from 'express';
import { ExecutionService } from './execution.service';
import { requireWorkspaceAccess } from '../../middleware/workspace-auth.middleware';
import { PackageManagerService } from './package-manager.service';
import { PackageManagerRegistry } from './package-registry';
import { Workspace } from '../workspaces/workspace.model';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router({ mergeParams: true });
router.use(authMiddleware as any);

router.post('/run', requireWorkspaceAccess('viewer') as any, async (req, res) => {
  const timestamp = () => `[${new Date().toISOString()}]`;
  try {
    const { workspaceId } = req.params as any;
    const { filePath } = req.body;
    console.log(`${timestamp()} [ExecutionRouter] Incoming POST /run: workspaceId=${workspaceId}, filePath=${filePath}`);
    
    if (!filePath) {
      console.warn(`${timestamp()} [ExecutionRouter] Missing filePath parameter`);
      res.status(400).json({ error: 'filePath parameter is required.' });
      return;
    }

    const result = await ExecutionService.run(workspaceId, filePath);
    console.log(`${timestamp()} [ExecutionRouter] Success, returning result:`, result);
    res.json(result);
  } catch (err: any) {
    console.error(`${timestamp()} [ExecutionRouter] Failure:`, err);
    res.status(500).json({ error: err.message || 'Execution request failed' });
  }
});

router.get('/package/detect', requireWorkspaceAccess('viewer') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    const result = PackageManagerRegistry.detect(workspace.storagePath);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Detection failed' });
  }
});

router.post('/package/command', requireWorkspaceAccess('editor') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { action, packageName } = req.body;
    if (!action) {
      res.status(400).json({ error: 'action parameter is required' });
      return;
    }
    const result = await PackageManagerService.getCommand(workspaceId, action, packageName);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to resolve package command' });
  }
});

router.post('/package/credentials', requireWorkspaceAccess('admin') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { managerId, registryUrl, authToken } = req.body;
    if (!managerId || !registryUrl || !authToken) {
      res.status(400).json({ error: 'managerId, registryUrl, and authToken are required' });
      return;
    }
    await PackageManagerService.setCredentials(workspaceId, managerId, registryUrl, authToken);
    res.json({ success: true, message: 'Registry credentials saved successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save credentials' });
  }
});

// --- Python Integration Endpoints ---

router.get('/python/detect', requireWorkspaceAccess('viewer') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { PythonService } = require('./python.service');
    const interpreters = await PythonService.detectInterpreters(workspaceId);
    res.json(interpreters);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to detect Python' });
  }
});

router.post('/python/interpreter', requireWorkspaceAccess('editor') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { pythonPath } = req.body;
    if (!pythonPath) {
      res.status(400).json({ error: 'pythonPath parameter is required' });
      return;
    }
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    workspace.settings.pythonPath = pythonPath;
    await workspace.save();
    res.json({ success: true, settings: workspace.settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save Python interpreter path' });
  }
});

router.post('/python/venv/create', requireWorkspaceAccess('editor') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    const pythonBin = workspace.settings.pythonPath || 'python';
    
    // Trigger terminal command for venv creation to allow user visibility
    const { useTerminalStore } = require('../terminal/terminal.service'); // Fallback trigger
    const termCommand = `${pythonBin} -m venv .venv`;
    
    res.json({ success: true, command: termCommand });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to initiate virtualenv creation' });
  }
});

router.post('/python/notebook/run-cell', requireWorkspaceAccess('editor') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { code } = req.body;
    if (code === undefined) {
      res.status(400).json({ error: 'code parameter is required' });
      return;
    }
    const { PythonService } = require('./python.service');
    const result = await PythonService.runCodeBlock(workspaceId, code);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Notebook cell execution failed' });
  }
});

router.get('/status', requireWorkspaceAccess('viewer') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { WorkspaceRunnerService } = require('../workspaces/workspace-runner.service');
    const status = await WorkspaceRunnerService.getRunnerStatus(workspaceId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to check runner status' });
  }
});

router.post('/prewarm', requireWorkspaceAccess('viewer') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }
    const { WorkspaceRunnerService } = require('../workspaces/workspace-runner.service');
    // Pre-warm the container asynchronously in background
    WorkspaceRunnerService.startRunner(workspaceId, workspace.storagePath)
      .then((container: string | null) => {
        console.log(`[ExecutionRoutes] Pre-warming complete for workspace ${workspaceId}: container=${container}`);
      })
      .catch((e: Error) => {
        console.error(`[ExecutionRoutes] Pre-warming failed for workspace ${workspaceId}:`, e);
      });
    res.json({ success: true, message: 'Pre-warming initiated.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to initiate pre-warming' });
  }
});

router.get('/metrics', requireWorkspaceAccess('viewer') as any, async (req, res) => {
  try {
    res.json(ExecutionService.getMetrics());
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve metrics' });
  }
});

router.post('/restart-engine', requireWorkspaceAccess('editor') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { WorkspaceRunnerService } = require('../workspaces/workspace-runner.service');
    console.log(`[ExecutionRoutes] Force restarting engine for workspace ${workspaceId}`);
    
    // Stop the active runner (which force removes the container)
    await WorkspaceRunnerService.stopRunner(workspaceId);
    
    // Fetch workspace details and start it fresh
    const workspace = await Workspace.findById(workspaceId);
    if (workspace) {
      await WorkspaceRunnerService.startRunner(workspaceId, workspace.storagePath);
    }
    
    res.json({ success: true, message: 'Sandbox engine restarted successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to restart sandbox engine' });
  }
});

export default router;
