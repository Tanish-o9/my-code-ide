import { Response } from 'express';
import { WorkspaceRequest } from '../../middleware/workspace-auth.middleware';
import { LaunchConfiguration, Breakpoint } from './debug.model';
import { Workspace } from '../workspaces/workspace.model';

/**
 * GET: Retrieve launch configurations, suggesting template defaults if empty.
 */
export const getLaunchConfigs = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.workspace!.id;
    let configs = await LaunchConfiguration.find({ workspaceId });

    if (configs.length === 0) {
      const suggestedNode = new LaunchConfiguration({
        workspaceId,
        name: 'Launch Node.js Program',
        adapterType: 'node',
        program: 'index.js',
        args: [],
        env: {},
        mode: 'launch',
      });
      await suggestedNode.save();

      const suggestedPython = new LaunchConfiguration({
        workspaceId,
        name: 'Launch Python Program',
        adapterType: 'python',
        program: 'main.py',
        args: [],
        env: {},
        mode: 'launch',
      });
      await suggestedPython.save();

      configs = [suggestedNode, suggestedPython];
    }

    res.status(200).json(configs);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve launch configurations' });
  }
};

/**
 * POST: Create or overwrite a launch configuration.
 */
export const saveLaunchConfig = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.workspace!.id;
    const { name, adapterType, program, args, env, mode, id } = req.body;

    if (!name || !adapterType || !program) {
      res.status(400).json({ error: 'name, adapterType, and program are required' });
      return;
    }

    if (id) {
      const updated = await LaunchConfiguration.findOneAndUpdate(
        { _id: id, workspaceId },
        { name, adapterType, program, args, env, mode },
        { new: true }
      );
      res.status(200).json(updated);
    } else {
      const created = new LaunchConfiguration({
        workspaceId,
        name,
        adapterType,
        program,
        args: args || [],
        env: env || {},
        mode: mode || 'launch',
      });
      await created.save();
      res.status(201).json(created);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save launch configuration' });
  }
};

/**
 * DELETE: Delete a launch configuration.
 */
export const deleteLaunchConfig = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.workspace!.id;
    const { id } = req.params;

    await LaunchConfiguration.findOneAndDelete({ _id: id, workspaceId });
    res.status(200).json({ message: 'Launch configuration deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete launch configuration' });
  }
};

/**
 * GET: Retrieve all persisted breakpoints for a workspace.
 */
export const getBreakpoints = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.workspace!.id;
    const breakpoints = await Breakpoint.find({ workspaceId });
    res.status(200).json(breakpoints);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to retrieve breakpoints' });
  }
};

/**
 * POST: Set or toggle bulk breakpoints for a specific file.
 */
export const setBreakpoints = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.workspace!.id;
    const { filePath, breakpoints } = req.body; // breakpoints is array of { line: number, enabled: boolean, condition?: string, logMessage?: string }

    if (!filePath) {
      res.status(400).json({ error: 'filePath is required' });
      return;
    }

    // Delete existing breakpoints for this file path
    await Breakpoint.deleteMany({ workspaceId, filePath });

    const newBreakpoints = [];
    if (breakpoints && Array.isArray(breakpoints)) {
      for (const bp of breakpoints) {
        const created = new Breakpoint({
          workspaceId,
          filePath,
          line: bp.line,
          enabled: bp.enabled !== false,
          condition: bp.condition,
          logMessage: bp.logMessage,
        });
        await created.save();
        newBreakpoints.push(created);
      }
    }

    res.status(200).json(newBreakpoints);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to set breakpoints' });
  }
};
