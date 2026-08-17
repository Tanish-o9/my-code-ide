import { Router } from 'express';
import { 
  getStatus, 
  getDiff, 
  stageFiles, 
  unstageFiles, 
  commit, 
  listBranches, 
  createBranch, 
  switchBranch,
  getRemoteSettings,
  configureRemoteSettings,
  pushCommits,
  pullChanges,
  getSyncStatus,
  listConflicts,
  getFileConflicts,
  resolveConflict,
  getHistory,
  getBlame,
  getBaseFileContent,
  initRepo,
  cloneRepo,
  discardChanges,
  stashChanges,
  rebaseBranch,
  cherryPickCommit
} from './git.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireWorkspaceAccess } from '../../middleware/workspace-auth.middleware';

const router = Router();

// Require viewer access to check status and read diffs/branches/credentials/conflicts/history/blame
router.get('/:workspaceId/git/status', authMiddleware as any, requireWorkspaceAccess('viewer') as any, getStatus as any);
router.get('/:workspaceId/git/diff', authMiddleware as any, requireWorkspaceAccess('viewer') as any, getDiff as any);
router.get('/:workspaceId/git/branches', authMiddleware as any, requireWorkspaceAccess('viewer') as any, listBranches as any);
router.get('/:workspaceId/git/remote', authMiddleware as any, requireWorkspaceAccess('viewer') as any, getRemoteSettings as any);
router.get('/:workspaceId/git/sync-status', authMiddleware as any, requireWorkspaceAccess('viewer') as any, getSyncStatus as any);
router.get('/:workspaceId/git/conflicts', authMiddleware as any, requireWorkspaceAccess('viewer') as any, listConflicts as any);
router.get('/:workspaceId/git/conflicts/file', authMiddleware as any, requireWorkspaceAccess('viewer') as any, getFileConflicts as any);
router.get('/:workspaceId/git/history', authMiddleware as any, requireWorkspaceAccess('viewer') as any, getHistory as any);
router.get('/:workspaceId/git/blame', authMiddleware as any, requireWorkspaceAccess('viewer') as any, getBlame as any);
router.get('/:workspaceId/git/show', authMiddleware as any, requireWorkspaceAccess('viewer') as any, getBaseFileContent as any);

// Require editor access to stage, unstage, commit, create/switch branches, sync remotes, and resolve merge blocks
router.post('/:workspaceId/git/stage', authMiddleware as any, requireWorkspaceAccess('editor') as any, stageFiles as any);
router.post('/:workspaceId/git/unstage', authMiddleware as any, requireWorkspaceAccess('editor') as any, unstageFiles as any);
router.post('/:workspaceId/git/commit', authMiddleware as any, requireWorkspaceAccess('editor') as any, commit as any);
router.post('/:workspaceId/git/branches', authMiddleware as any, requireWorkspaceAccess('editor') as any, createBranch as any);
router.post('/:workspaceId/git/branches/switch', authMiddleware as any, requireWorkspaceAccess('editor') as any, switchBranch as any);
router.post('/:workspaceId/git/remote', authMiddleware as any, requireWorkspaceAccess('editor') as any, configureRemoteSettings as any);
router.post('/:workspaceId/git/push', authMiddleware as any, requireWorkspaceAccess('editor') as any, pushCommits as any);
router.post('/:workspaceId/git/pull', authMiddleware as any, requireWorkspaceAccess('editor') as any, pullChanges as any);
router.post('/:workspaceId/git/conflicts/resolve', authMiddleware as any, requireWorkspaceAccess('editor') as any, resolveConflict as any);
router.post('/:workspaceId/git/init', authMiddleware as any, requireWorkspaceAccess('editor') as any, initRepo as any);
router.post('/:workspaceId/git/clone', authMiddleware as any, requireWorkspaceAccess('editor') as any, cloneRepo as any);
router.post('/:workspaceId/git/discard', authMiddleware as any, requireWorkspaceAccess('editor') as any, discardChanges as any);
router.post('/:workspaceId/git/stash', authMiddleware as any, requireWorkspaceAccess('editor') as any, stashChanges as any);
router.post('/:workspaceId/git/rebase', authMiddleware as any, requireWorkspaceAccess('editor') as any, rebaseBranch as any);
router.post('/:workspaceId/git/cherry-pick', authMiddleware as any, requireWorkspaceAccess('editor') as any, cherryPickCommit as any);

export default router;
