import { Router } from 'express';
import { saveEnv, listEnv, deleteEnv } from './env.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireWorkspaceAccess } from '../../middleware/workspace-auth.middleware';

const router = Router();

// Require authenticated token
router.use(authMiddleware as any);

// Workspace-specific environment routes
router.get('/:workspaceId/env', requireWorkspaceAccess('editor') as any, listEnv as any);
router.post('/:workspaceId/env', requireWorkspaceAccess('editor') as any, saveEnv as any);
router.delete('/:workspaceId/env/:envId', requireWorkspaceAccess('editor') as any, deleteEnv as any);

export default router;
