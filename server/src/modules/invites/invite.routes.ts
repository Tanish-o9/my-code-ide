import { Router } from 'express';
import { createInvite, getInviteDetails, acceptInvite } from './invite.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireWorkspaceAccess } from '../../middleware/workspace-auth.middleware';

const router = Router();

// Public: Resolve invite details to show on accept page
router.get('/invites/:token', getInviteDetails as any);

// Auth protected invite creations
router.post(
  '/workspaces/:workspaceId/invites',
  authMiddleware as any,
  requireWorkspaceAccess('editor') as any,
  createInvite as any
);

// Auth protected invite acceptances
router.post('/invites/:token/accept', authMiddleware as any, acceptInvite as any);

export default router;
