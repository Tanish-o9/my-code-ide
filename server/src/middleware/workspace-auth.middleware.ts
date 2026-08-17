import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';
import { Workspace, IWorkspace, ICollaborator } from '../modules/workspaces/workspace.model';

export interface WorkspaceRequest extends AuthenticatedRequest {
  workspace?: IWorkspace;
}

const roleLevels: Record<string, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

export const requireWorkspaceAccess = (minRole: 'viewer' | 'editor' | 'admin') => {
  return async (
    req: WorkspaceRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const timestamp = () => `[${new Date().toISOString()}]`;
    try {
      const userId = req.user?.userId;
      const workspaceId = req.params.id || req.params.workspaceId;
      console.log(`${timestamp()} [WorkspaceAuth] Checking access: userId=${userId}, workspaceId=${workspaceId}, minRole=${minRole}`);

      if (!userId) {
        console.warn(`${timestamp()} [WorkspaceAuth] Denied: Authentication required`);
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      if (!workspaceId) {
        console.warn(`${timestamp()} [WorkspaceAuth] Denied: Workspace ID required`);
        res.status(400).json({ error: 'Workspace ID required' });
        return;
      }

      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        console.warn(`${timestamp()} [WorkspaceAuth] Denied: Workspace not found for ID ${workspaceId}`);
        res.status(404).json({ error: 'Workspace not found' });
        return;
      }

      // Check ownership
      const isOwner = workspace.ownerId.toString() === userId;
      if (isOwner) {
        console.log(`${timestamp()} [WorkspaceAuth] Access granted: User is owner`);
        req.workspace = workspace;
        return next();
      }

      // Check collaborator role
      const collaborator = workspace.collaborators.find(
        (c: ICollaborator) => c.userId.toString() === userId
      );

      if (!collaborator) {
        res.status(403).json({ error: 'Access denied: You are not a collaborator on this workspace' });
        return;
      }

      const userRoleLevel = roleLevels[collaborator.role] || 0;
      const requiredRoleLevel = roleLevels[minRole] || 99;

      if (userRoleLevel < requiredRoleLevel) {
        res.status(403).json({ error: `Access denied: Requires ${minRole} privileges` });
        return;
      }

      req.workspace = workspace;
      next();
    } catch (error: any) {
      console.error('[Workspace/Auth] Error:', error);
      res.status(500).json({ error: 'Internal server error during authorization check' });
    }
  };
};
