import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { WorkspaceRequest } from '../../middleware/workspace-auth.middleware';
import { GitService, GitResult } from './git.service';
import { User } from '../users/user.model';
import { SyncManager } from '../collaboration/sync.manager';

export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  isBinary: boolean;
  hunks: DiffHunk[];
}

/**
 * Helper to parse git status --porcelain output.
 */
function parsePorcelainStatus(stdout: string): { staged: string[]; unstaged: string[]; untracked: string[]; conflicted: string[] } {
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];
  const conflicted: string[] = [];

  const lines = stdout.split('\n');
  for (const line of lines) {
    if (line.length < 4) continue;
    
    const xy = line.slice(0, 2);
    let filePath = line.slice(3).trim();

    // Unquote if double-quoted (handles spaces/unicode)
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      filePath = filePath.slice(1, -1).replace(/\\"/g, '"');
    }

    // Handles renamed files: "old_path -> new_path"
    if (xy[0] === 'R') {
      const parts = filePath.split(' -> ');
      if (parts.length > 1) {
        filePath = parts[1]; // Target new path
      }
    }

    const x = xy[0];
    const y = xy[1];

    const isConflict = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(xy) || x === 'U' || y === 'U';

    if (isConflict) {
      conflicted.push(filePath);
      unstaged.push(filePath);
    } else if (x === '?' && y === '?') {
      untracked.push(filePath);
    } else {
      if (['M', 'A', 'D', 'R', 'C'].includes(x)) {
        staged.push(filePath);
      }
      if (['M', 'D'].includes(y)) {
        unstaged.push(filePath);
      }
    }
  }

  return { staged, unstaged, untracked, conflicted };
}

/**
 * Helper to parse git diff output.
 */
function parseGitDiff(stdout: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = stdout.split('\n');
  
  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  
  let oldLineNum = 0;
  let newLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git ')) {
      currentFile = {
        oldPath: '',
        newPath: '',
        isBinary: false,
        hunks: [],
      };
      files.push(currentFile);
      currentHunk = null;
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith('--- a/')) {
      currentFile.oldPath = line.slice(6);
      continue;
    }

    if (line.startsWith('+++ b/')) {
      currentFile.newPath = line.slice(6);
      continue;
    }

    if (line.startsWith('Binary files ')) {
      currentFile.isBinary = true;
      continue;
    }

    if (line.startsWith('@@ ')) {
      const match = line.match(/^@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[3], 10);
      }
      
      currentHunk = {
        header: line,
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'add',
        content: line.slice(1),
        newLineNumber: newLineNum++,
      });
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'delete',
        content: line.slice(1),
        oldLineNumber: oldLineNum++,
      });
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({
        type: 'context',
        content: line.slice(1),
        oldLineNumber: oldLineNum++,
        newLineNumber: newLineNum++,
      });
    }
  }

  return files;
}

// -------------------------------------------------------------
// ENDPOINTS
// -------------------------------------------------------------

/**
 * GET: Retrieve git status.
 */
export const getStatus = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const result = await GitService.run(req.workspace!.id, ['status', '--porcelain']);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Git status failed' });
      return;
    }
    const statusData = parsePorcelainStatus(result.stdout);
    res.status(200).json(statusData);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * GET: Retrieve git diff (staged vs unstaged).
 */
export const getDiff = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { staged, file } = req.query;
    const args = ['diff'];
    if (staged === 'true') {
      args.push('--staged');
    }
    if (file) {
      args.push('--', file as string);
    }

    const result = await GitService.run(req.workspace!.id, args);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Git diff failed' });
      return;
    }

    const parsedDiff = parseGitDiff(result.stdout);
    res.status(200).json(parsedDiff);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Stage a file or multiple files.
 */
export const stageFiles = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      res.status(400).json({ error: 'Array of files is required' });
      return;
    }

    const result = await GitService.run(req.workspace!.id, ['add', ...files]);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Git add failed' });
      return;
    }
    res.status(200).json({ message: 'Files staged successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Unstage a file or multiple files.
 */
export const unstageFiles = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files)) {
      res.status(400).json({ error: 'Array of files is required' });
      return;
    }

    const result = await GitService.run(req.workspace!.id, ['restore', '--staged', '--', ...files]);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Git restore failed' });
      return;
    }
    res.status(200).json({ message: 'Files unstaged successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Create a git commit.
 */
export const commit = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { message, amend } = req.body;
    const user = await User.findById((req as any).user.userId);
    if (!user) {
      res.status(401).json({ error: 'User profile not resolved' });
      return;
    }

    if (!message && !amend) {
      res.status(400).json({ error: 'Commit message is required' });
      return;
    }

    // Set author credentials dynamically via config parameters (Module 64)
    const commitArgs = [
      '-c', `user.name=${user.name}`,
      '-c', `user.email=${user.email}`,
      'commit',
    ];

    if (amend === true) {
      commitArgs.push('--amend');
    }

    if (message) {
      commitArgs.push('-m', message);
    } else {
      commitArgs.push('--no-edit');
    }

    const result = await GitService.run(req.workspace!.id, commitArgs);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Git commit failed' });
      return;
    }

    res.status(200).json({ message: 'Committed successfully', stdout: result.stdout });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * GET: Retrieve list of local branches.
 */
export const listBranches = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const result = await GitService.run(req.workspace!.id, ['branch', '--format=%(refname:short) %(upstream:track)']);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Git branch listing failed' });
      return;
    }

    const branches = result.stdout
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean);

    // Get active branch name
    const activeRes = await GitService.run(req.workspace!.id, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const activeBranch = activeRes.exitCode === 0 ? activeRes.stdout.trim() : '';

    res.status(200).json({ branches, activeBranch });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Create a branch.
 */
export const createBranch = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { branchName, startPoint } = req.body;
    if (!branchName) {
      res.status(400).json({ error: 'Branch name is required' });
      return;
    }

    const args = ['branch', branchName];
    if (startPoint) {
      args.push(startPoint);
    }

    const result = await GitService.run(req.workspace!.id, args);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Git branch creation failed' });
      return;
    }

    res.status(201).json({ message: `Branch ${branchName} created successfully` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Switch (checkout) a branch. Checks for dirty modifications first (Module 65).
 */
export const switchBranch = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { branchName, force } = req.body;
    if (!branchName) {
      res.status(400).json({ error: 'Target branch name is required' });
      return;
    }

    const workspaceId = req.workspace!.id;

    // 1. Check tree cleanliness before checking out
    const statusRes = await GitService.run(workspaceId, ['status', '--porcelain']);
    const hasUncommitted = statusRes.stdout.trim().length > 0;

    if (hasUncommitted && !force) {
      res.status(409).json({
        error: 'Uncommitted changes detected',
        code: 'DIRTY_TREE',
        message: 'You have uncommitted modifications. Switching branches might overwrite them.',
      });
      return;
    }

    // 2. Query Module 50/72: Warn if checkout affects files with active collaborative editor sessions
    if (!force) {
      const activeFiles = SyncManager.getActiveFiles(workspaceId);
      const affectedFiles: string[] = [];
      for (const file of activeFiles) {
        // Run diff to check if file has differences between current HEAD and target branch
        const diffRes = await GitService.run(workspaceId, ['diff', '--name-only', 'HEAD', branchName, '--', file]);
        if (diffRes.exitCode === 0 && diffRes.stdout.trim()) {
          affectedFiles.push(file);
        }
      }

      if (affectedFiles.length > 0) {
        res.status(409).json({
          error: 'Active collaborative edits detected',
          code: 'COLLAB_ACTIVE',
          message: `Collaborators are active on: ${affectedFiles.join(', ')}. Switching branches will overwrite these files and disrupt active sessions.`,
        });
        return;
      }
    }

    // 3. Stash before checkout if requested
    if (hasUncommitted && force === 'stash') {
      const stashRes = await GitService.run(workspaceId, ['stash']);
      if (stashRes.exitCode !== 0) {
        res.status(400).json({ error: stashRes.stderr || 'Stash failed' });
        return;
      }
    }

    const checkoutResult = await GitService.run(workspaceId, ['checkout', branchName]);
    if (checkoutResult.exitCode !== 0) {
      res.status(400).json({ error: checkoutResult.stderr || 'Git checkout failed' });
      return;
    }

    // If we stashed, pop it on the new branch
    if (hasUncommitted && force === 'stash') {
      await GitService.run(workspaceId, ['stash', 'pop']);
    }

    res.status(200).json({ message: `Switched to branch ${branchName} successfully` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// -------------------------------------------------------------
// REMOTE CONFIGURATION, CREDENTIALS, PUSH & PULL (Modules 66, 67)
// -------------------------------------------------------------
import crypto from 'crypto';
import { GitCredential } from './git-credential.model';

/**
 * GET: Retrieve remote credential settings.
 */
export const getRemoteSettings = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const credential = await GitCredential.findOne({ workspaceId: req.workspace!.id });
    if (!credential) {
      res.status(200).json({ remoteUrl: '', authType: 'token', hasKey: false });
      return;
    }
    res.status(200).json({
      remoteUrl: credential.remoteUrl || '',
      authType: credential.authType,
      sshPublicKey: credential.sshPublicKey || '',
      hasKey: !!(credential.tokenEncrypted || credential.sshPrivateKeyEncrypted),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Configure remote url and credentials.
 */
export const configureRemoteSettings = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const { remoteUrl, authType, token, sshPrivateKey } = req.body;
    if (!authType || (authType !== 'token' && authType !== 'ssh')) {
      res.status(400).json({ error: 'Valid authType (token/ssh) is required' });
      return;
    }

    const workspaceId = req.workspace!.id;
    let credential = await GitCredential.findOne({ workspaceId });
    if (!credential) {
      credential = new GitCredential({ workspaceId, authType });
    } else {
      credential.authType = authType;
    }

    if (remoteUrl) {
      credential.remoteUrl = remoteUrl;
      
      // Update origin URL in local git repo
      const remoteCheck = await GitService.run(workspaceId, ['remote', 'get-url', 'origin']);
      if (remoteCheck.exitCode === 0) {
        await GitService.run(workspaceId, ['remote', 'set-url', 'origin', remoteUrl]);
      } else {
        await GitService.run(workspaceId, ['remote', 'add', 'origin', remoteUrl]);
      }
    }

    if (authType === 'token') {
      if (token) {
        credential.setToken(token);
      }
      credential.sshPrivateKeyEncrypted = undefined;
      credential.sshPublicKey = undefined;
    } else {
      if (sshPrivateKey) {
        credential.setSshPrivateKey(sshPrivateKey);
        credential.sshPublicKey = '';
      } else if (!credential.sshPrivateKeyEncrypted) {
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        });
        credential.setSshPrivateKey(privateKey);
        credential.sshPublicKey = publicKey;
      }
      credential.tokenEncrypted = undefined;
    }

    await credential.save();

    res.status(200).json({
      message: 'Remote credentials configured successfully',
      sshPublicKey: credential.sshPublicKey || '',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Push local commits.
 */
export const pushCommits = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.workspace!.id;
    const activeRes = await GitService.run(workspaceId, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = activeRes.exitCode === 0 ? activeRes.stdout.trim() : 'master';

    const result = await GitService.run(workspaceId, ['push', 'origin', branch]);

    if (result.exitCode === 0) {
      res.status(200).json({ success: true, message: 'Pushed successfully.' });
      return;
    }

    const stderr = result.stderr.toLowerCase();
    if (stderr.includes('rejected') || stderr.includes('non-fast-forward')) {
      res.status(400).json({
        success: false,
        code: 'REJECTED',
        message: 'Push rejected. Remote contains changes that you do not have locally. Please pull first.',
      });
    } else if (stderr.includes('permission denied') || stderr.includes('authentication failed') || stderr.includes('could not resolve host')) {
      res.status(401).json({
        success: false,
        code: 'AUTH_OR_NETWORK_ERROR',
        message: 'Authentication or network connection to remote failed.',
      });
    } else {
      res.status(400).json({
        success: false,
        code: 'PUSH_FAILED',
        message: result.stderr || 'Git push failed',
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Pull changes.
 */
export const pullChanges = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.workspace!.id;
    const activeRes = await GitService.run(workspaceId, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = activeRes.exitCode === 0 ? activeRes.stdout.trim() : 'master';

    const result = await GitService.run(workspaceId, ['pull', 'origin', branch]);

    if (result.exitCode === 0) {
      res.status(200).json({ success: true, message: 'Pulled successfully.' });
      return;
    }

    const stderr = result.stderr.toLowerCase();
    const stdout = result.stdout.toLowerCase();
    if (stderr.includes('conflict') || stdout.includes('conflict') || stderr.includes('merge failed')) {
      res.status(400).json({
        success: false,
        code: 'NEEDS_MERGE',
        message: 'Pull succeeded but has merge conflicts. Please resolve conflicts before committing.',
      });
    } else if (stderr.includes('permission denied') || stderr.includes('authentication failed') || stderr.includes('could not resolve host')) {
      res.status(401).json({
        success: false,
        code: 'AUTH_OR_NETWORK_ERROR',
        message: 'Authentication or network connection to remote failed.',
      });
    } else {
      res.status(400).json({
        success: false,
        code: 'PULL_FAILED',
        message: result.stderr || 'Git pull failed',
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * GET: Retrieve commit counts status (ahead / behind).
 */
export const getSyncStatus = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.workspace!.id;
    const trackRes = await GitService.run(workspaceId, ['rev-parse', '--abbrev-ref', '@{u}']);
    if (trackRes.exitCode !== 0) {
      res.status(200).json({ ahead: 0, behind: 0, trackingBranch: null });
      return;
    }
    const trackingBranch = trackRes.stdout.trim();

    const statsRes = await GitService.run(workspaceId, ['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
    if (statsRes.exitCode !== 0) {
      res.status(200).json({ ahead: 0, behind: 0, trackingBranch });
      return;
    }

    const [ahead, behind] = statsRes.stdout.trim().split(/\s+/).map((n) => parseInt(n, 10));
    res.status(200).json({ ahead: ahead || 0, behind: behind || 0, trackingBranch });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// -------------------------------------------------------------
// MERGE CONFLICT RESOLUTION (Module 69)
// -------------------------------------------------------------

export interface ConflictBlock {
  type: 'normal' | 'conflict';
  content?: string;
  ours?: string;
  theirs?: string;
}

function parseConflictMarkers(fileContent: string): ConflictBlock[] {
  const blocks: ConflictBlock[] = [];
  const lines = fileContent.split('\n');
  
  let currentNormal: string[] = [];
  let inConflict = false;
  let conflictOurs: string[] = [];
  let conflictTheirs: string[] = [];
  let inTheirs = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('<<<<<<< ')) {
      if (currentNormal.length > 0) {
        blocks.push({ type: 'normal', content: currentNormal.join('\n') });
        currentNormal = [];
      }
      inConflict = true;
      inTheirs = false;
      conflictOurs = [];
      conflictTheirs = [];
    } else if (line.startsWith('=======')) {
      inTheirs = true;
    } else if (line.startsWith('>>>>>>> ')) {
      blocks.push({
        type: 'conflict',
        ours: conflictOurs.join('\n'),
        theirs: conflictTheirs.join('\n'),
      });
      inConflict = false;
      inTheirs = false;
    } else {
      if (inConflict) {
        if (inTheirs) {
          conflictTheirs.push(line);
        } else {
          conflictOurs.push(line);
        }
      } else {
        currentNormal.push(line);
      }
    }
  }

  if (currentNormal.length > 0) {
    blocks.push({ type: 'normal', content: currentNormal.join('\n') });
  }

  return blocks;
}

/**
 * GET: Retrieve list of conflicted files.
 */
export const listConflicts = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.workspace!.id;
    // Get unmerged files
    const result = await GitService.run(workspaceId, ['diff', '--name-only', '--diff-filter=U']);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Failed to list conflict files' });
      return;
    }

    const files = result.stdout
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    res.status(200).json(files);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * GET: Parse conflict markers of a specific file.
 */
export const getFileConflicts = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const relPath = req.query.path as string;
    if (!relPath) {
      res.status(400).json({ error: 'File path parameter is required' });
      return;
    }

    const fullPath = path.join(workspace.storagePath, relPath);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const fileContent = fs.readFileSync(fullPath, 'utf8');
    const parsedBlocks = parseConflictMarkers(fileContent);

    res.status(200).json(parsedBlocks);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Save resolved file and stage it in git.
 */
export const resolveConflict = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const { path: relPath, content } = req.body;

    if (!relPath || content === undefined) {
      res.status(400).json({ error: 'File path and resolved content are required' });
      return;
    }

    // Validate that resolved content does not contain leftover conflict marker syntax (Module 69)
    if (
      content.includes('<<<<<<< ') ||
      content.includes('=======') ||
      content.includes('>>>>>>> ')
    ) {
      res.status(400).json({
        error: 'Resolved content still contains Git conflict markers. Please clean them up before staging.',
      });
      return;
    }

    const fullPath = path.join(workspace.storagePath, relPath);
    fs.writeFileSync(fullPath, content, 'utf8');

    // Stage resolved file
    const result = await GitService.run(workspace.id, ['add', relPath]);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Git add resolved file failed' });
      return;
    }

    res.status(200).json({ message: 'Conflict resolved and staged successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * GET: Retrieve commit log history (Module 70)
 */
export const getHistory = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspaceId = req.workspace!.id;
    const result = await GitService.run(workspaceId, ['log', '--pretty=format:%H|%P|%an|%ae|%at|%s|%d', '-n', '100']);
    
    if (result.exitCode !== 0) {
      // If there are no commits yet (empty repo), return empty array
      res.status(200).json([]);
      return;
    }

    const commits = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [hash, parentsStr, author, email, timestamp, message, refs] = line.split('|');
        return {
          hash,
          parents: parentsStr ? parentsStr.split(' ') : [],
          author,
          email,
          date: timestamp ? new Date(parseInt(timestamp, 10) * 1000).toISOString() : new Date().toISOString(),
          message: message || 'No message',
          refs: refs ? refs.trim() : ''
        };
      });

    res.status(200).json(commits);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * GET: Retrieve file line blame metrics (Module 70)
 */
export const getBlame = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const relPath = req.query.path as string;
    if (!relPath) {
      res.status(400).json({ error: 'File path parameter is required' });
      return;
    }

    const result = await GitService.run(workspace.id, ['blame', '--porcelain', '--', relPath]);
    if (result.exitCode !== 0) {
      res.status(200).json([]);
      return;
    }

    const lines = result.stdout.split('\n');
    const blameLines: Array<{ author: string; summary: string; time: number }> = [];
    const commits: Record<string, { author: string; summary: string; time: number }> = {};
    let currentCommitHash = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      if (/^[0-9a-f]{40}/.test(line)) {
        const parts = line.split(' ');
        currentCommitHash = parts[0];
        if (!commits[currentCommitHash]) {
          commits[currentCommitHash] = { author: 'Unknown', summary: 'No commit message', time: 0 };
        }
      } else if (line.startsWith('author ')) {
        commits[currentCommitHash].author = line.substring(7);
      } else if (line.startsWith('author-time ')) {
        commits[currentCommitHash].time = parseInt(line.substring(12), 10) * 1000;
      } else if (line.startsWith('summary ')) {
        commits[currentCommitHash].summary = line.substring(8);
      } else if (line.startsWith('\t')) {
        blameLines.push({
          author: commits[currentCommitHash].author,
          summary: commits[currentCommitHash].summary,
          time: commits[currentCommitHash].time,
        });
      }
    }

    res.status(200).json(blameLines);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

export const getBaseFileContent = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const relPath = req.query.path as string;
    if (!relPath) {
      res.status(400).json({ error: 'File path parameter is required' });
      return;
    }

    const result = await GitService.run(workspace.id, ['show', `HEAD:${relPath}`]);
    if (result.exitCode !== 0) {
      res.status(200).send('');
      return;
    }

    res.status(200).send(result.stdout);
  } catch (err: any) {
    res.status(200).send('');
  }
};

/**
 * POST: Initialize repository
 */
export const initRepo = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const result = await GitService.run(workspace.id, ['init']);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Failed to initialize Git repository' });
      return;
    }
    res.status(200).json({ success: true, message: result.stdout });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Clone repository
 */
export const cloneRepo = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'Clone URL is required' });
      return;
    }
    
    const result = await GitService.run(workspace.id, ['clone', url, '.']);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Failed to clone repository' });
      return;
    }
    res.status(200).json({ success: true, message: result.stdout });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Discard file changes
 */
export const discardChanges = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const { path: relPath } = req.body;
    if (!relPath) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }
    const result = await GitService.run(workspace.id, ['checkout', '--', relPath]);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Failed to discard changes' });
      return;
    }
    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Stash changes (push, pop, list)
 */
export const stashChanges = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const { action, message } = req.body;
    
    if (action === 'list') {
      const result = await GitService.run(workspace.id, ['stash', 'list']);
      const list = result.stdout.split('\n').filter(Boolean).map(line => ({ text: line }));
      res.status(200).json(list);
      return;
    }

    if (action === 'pop') {
      const result = await GitService.run(workspace.id, ['stash', 'pop']);
      if (result.exitCode !== 0) {
        res.status(400).json({ error: result.stderr || 'Failed to pop stash' });
        return;
      }
      res.status(200).json({ success: true });
      return;
    }

    const args = ['stash', 'push'];
    if (message) {
      args.push('-m', message);
    }
    const result = await GitService.run(workspace.id, args);
    if (result.exitCode !== 0) {
      res.status(400).json({ error: result.stderr || 'Failed to push stash' });
      return;
    }
    res.status(200).json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Rebase branch
 */
export const rebaseBranch = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const { branch } = req.body;
    if (!branch) {
      res.status(400).json({ error: 'Target branch is required' });
      return;
    }
    const result = await GitService.run(workspace.id, ['rebase', branch]);
    res.status(200).json({ 
      success: result.exitCode === 0, 
      exitCode: result.exitCode, 
      stdout: result.stdout, 
      stderr: result.stderr 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST: Cherry pick commit
 */
export const cherryPickCommit = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const { hash } = req.body;
    if (!hash) {
      res.status(400).json({ error: 'Commit hash is required' });
      return;
    }
    const result = await GitService.run(workspace.id, ['cherry-pick', hash]);
    res.status(200).json({ 
      success: result.exitCode === 0, 
      exitCode: result.exitCode, 
      stdout: result.stdout, 
      stderr: result.stderr 
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
