import { Response } from 'express';
import { WorkspaceRequest } from '../../middleware/workspace-auth.middleware';
import { RunConfiguration } from './runconfig.model';

/**
 * Creates or updates a run configuration.
 */
export const saveRunConfig = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { configId, name, command, workingDirectory, envOverrides } = req.body;
    const workspaceId = req.params.workspaceId;

    if (!name || !command) {
      res.status(400).json({ error: 'Name and command are required' });
      return;
    }

    let runConfig;
    if (configId) {
      runConfig = await RunConfiguration.findOneAndUpdate(
        { _id: configId, workspaceId },
        { name, command, workingDirectory, envOverrides },
        { new: true }
      );
    } else {
      runConfig = await RunConfiguration.create({
        workspaceId,
        name,
        command,
        workingDirectory,
        envOverrides,
      });
    }

    res.status(200).json(runConfig);
  } catch (err: any) {
    console.error('[RunConfig/Save] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Lists run configurations. Auto-suggests defaults based on workspace template if empty.
 */
export const listRunConfigs = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace;
    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    const configs = await RunConfiguration.find({ workspaceId: workspace._id });

    // Seed defaults if empty
    if (configs.length === 0) {
      const template = workspace.templateUsed || '';
      let defaultConfigs: any[] = [];

      if (template.includes('node') || template.includes('react') || template.includes('vite')) {
        defaultConfigs = [
          {
            name: 'npm run dev',
            command: 'npm run dev',
            workspaceId: workspace._id,
          },
          {
            name: 'npm test',
            command: 'npm test',
            workspaceId: workspace._id,
          }
        ];
      } else {
        defaultConfigs = [
          {
            name: 'Run script.js',
            command: 'node index.js',
            workspaceId: workspace._id,
          }
        ];
      }

      // Create them inside DB to persist defaults
      const persisted = await RunConfiguration.insertMany(defaultConfigs);
      res.status(200).json(persisted);
      return;
    }

    res.status(200).json(configs);
  } catch (err: any) {
    console.error('[RunConfig/List] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Deletes a run configuration.
 */
export const deleteRunConfig = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { configId } = req.params;
    const workspaceId = req.params.workspaceId;

    const result = await RunConfiguration.findOneAndDelete({ _id: configId, workspaceId });
    if (!result) {
      res.status(404).json({ error: 'Run configuration not found' });
      return;
    }

    res.status(200).json({ message: 'Run configuration deleted' });
  } catch (err: any) {
    console.error('[RunConfig/Delete] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
