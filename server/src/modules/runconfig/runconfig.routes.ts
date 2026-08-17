import { Router } from 'express';
import { saveRunConfig, listRunConfigs, deleteRunConfig } from './runconfig.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireWorkspaceAccess } from '../../middleware/workspace-auth.middleware';

const router = Router();

router.use(authMiddleware as any);

router.get('/:workspaceId/runconfigs', requireWorkspaceAccess('editor') as any, listRunConfigs as any);
router.post('/:workspaceId/runconfigs', requireWorkspaceAccess('editor') as any, saveRunConfig as any);
router.delete('/:workspaceId/runconfigs/:configId', requireWorkspaceAccess('editor') as any, deleteRunConfig as any);

export default router;
