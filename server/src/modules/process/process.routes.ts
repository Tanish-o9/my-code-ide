import { Router } from 'express';
import { listProcesses, killProcess } from './process.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireWorkspaceAccess } from '../../middleware/workspace-auth.middleware';

const router = Router();

router.use(authMiddleware as any);

router.get('/:workspaceId/processes', requireWorkspaceAccess('editor') as any, listProcesses as any);
router.post('/:workspaceId/processes/kill', requireWorkspaceAccess('editor') as any, killProcess as any);

export default router;
