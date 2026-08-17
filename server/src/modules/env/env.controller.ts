import { Response } from 'express';
import { WorkspaceRequest } from '../../middleware/workspace-auth.middleware';
import { WorkspaceEnv } from './env.model';
import { encrypt } from '../../utils/crypto';

/**
 * Creates or updates an environment variable for a workspace.
 */
export const saveEnv = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { key, value, isSecret } = req.body;
    const workspaceId = req.params.id || req.params.workspaceId;

    if (!key || value === undefined) {
      res.status(400).json({ error: 'Key and value are required' });
      return;
    }

    // Encrypt the value if marked as a secret
    const finalValue = isSecret ? encrypt(value) : value;

    // Check if key already exists for this workspace
    let envVar = await WorkspaceEnv.findOne({ workspaceId, key });
    if (envVar) {
      envVar.value = finalValue;
      envVar.isSecret = !!isSecret;
      await envVar.save();
    } else {
      envVar = await WorkspaceEnv.create({
        workspaceId,
        key,
        value: finalValue,
        isSecret: !!isSecret,
      });
    }

    // Return masked value in confirmation response
    res.status(200).json({
      _id: envVar._id,
      workspaceId: envVar.workspaceId,
      key: envVar.key,
      value: envVar.isSecret ? '********' : value,
      isSecret: envVar.isSecret,
    });
  } catch (err: any) {
    console.error('[Env/Save] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Lists environment variables. Masks secret values.
 */
export const listEnv = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.params.id || req.params.workspaceId;
    const envVars = await WorkspaceEnv.find({ workspaceId });

    // Mask secret values before returning to frontend
    const masked = envVars.map((env) => ({
      _id: env._id,
      key: env.key,
      value: env.isSecret ? '********' : env.value,
      isSecret: env.isSecret,
    }));

    res.status(200).json(masked);
  } catch (err: any) {
    console.error('[Env/List] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Deletes an environment variable.
 */
export const deleteEnv = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { envId } = req.params;
    const workspaceId = req.params.id || req.params.workspaceId;

    const result = await WorkspaceEnv.findOneAndDelete({ _id: envId, workspaceId });
    if (!result) {
      res.status(404).json({ error: 'Environment variable not found' });
      return;
    }

    res.status(200).json({ message: 'Environment variable deleted' });
  } catch (err: any) {
    console.error('[Env/Delete] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
