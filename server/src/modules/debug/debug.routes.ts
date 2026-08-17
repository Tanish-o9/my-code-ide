import { Router } from 'express';
import {
  getLaunchConfigs,
  saveLaunchConfig,
  deleteLaunchConfig,
  getBreakpoints,
  setBreakpoints,
} from './debug.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireWorkspaceAccess } from '../../middleware/workspace-auth.middleware';

const router = Router();

// Apply auth & workspace access middleware
router.use(authMiddleware);
router.use(requireWorkspaceAccess);

// Launch configuration routes
router.get('/:id/debug/configs', getLaunchConfigs);
router.post('/:id/debug/configs', saveLaunchConfig);
router.delete('/:id/debug/configs/:id', deleteLaunchConfig);

// Breakpoints routes
router.get('/:id/debug/breakpoints', getBreakpoints);
router.post('/:id/debug/breakpoints', setBreakpoints);

export default router;
