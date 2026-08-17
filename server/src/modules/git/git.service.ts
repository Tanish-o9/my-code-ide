import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Workspace } from '../workspaces/workspace.model';
import { WorkspaceRunnerService } from '../workspaces/workspace-runner.service';
import { GitCredential } from './git-credential.model';

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class GitService {
  /**
   * Executes a git command inside the workspace's container or local fallback.
   * Arguments are passed strictly as a discrete array to prevent command injection.
   */
  public static async run(workspaceId: string, gitArgs: string[]): Promise<GitResult> {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const containerName = await WorkspaceRunnerService.startRunner(workspaceId, workspace.storagePath);
    const credential = await GitCredential.findOne({ workspaceId });

    let finalGitArgs = [...gitArgs];
    let hostSshPath = '';
    let gitSshCommand = '';

    if (credential) {
      if (credential.authType === 'token') {
        const token = credential.getToken();
        if (token) {
          // Prepend credential helper config overrides to the arguments list
          const helperConfig = `!f() { echo "password=${token}"; }; f`;
          finalGitArgs = ['-c', `credential.helper=${helperConfig}`, ...finalGitArgs];
        }
      } else if (credential.authType === 'ssh') {
        const privateKey = credential.getSshPrivateKey();
        if (privateKey) {
          // Ensure .git directory exists to host the temp key securely
          const gitDir = path.join(workspace.storagePath, '.git');
          if (!fs.existsSync(gitDir)) {
            fs.mkdirSync(gitDir, { recursive: true });
          }

          hostSshPath = path.join(gitDir, 'git_ssh_key');
          fs.writeFileSync(hostSshPath, privateKey, { mode: 0o600 });

          // Configure SSH target identity overrides
          gitSshCommand = containerName
            ? 'ssh -i /workspace/.git/git_ssh_key -o StrictHostKeyChecking=no'
            : `ssh -i "${hostSshPath}" -o StrictHostKeyChecking=no`;
        }
      }
    }

    // Ensure hooks are executable inside the sandbox (Module 74)
    if (containerName) {
      try {
        const chmodProcess = spawn('docker', ['exec', containerName, 'sh', '-c', 'if [ -d /workspace/.git/hooks ]; then chmod -R +x /workspace/.git/hooks; fi']);
        await new Promise((resChmod) => chmodProcess.on('close', resChmod));
      } catch (err) {
        console.warn('[GitService] Failed to chmod git hooks:', err);
      }
    }

    return new Promise((resolve) => {
      let cmd: string;
      let args: string[];
      let spawnOpts: any = { env: { ...process.env } };

      if (containerName) {
        cmd = 'docker';
        args = ['exec', '-w', '/workspace'];
        if (gitSshCommand) {
          args.push('-e', `GIT_SSH_COMMAND=${gitSshCommand}`);
        }
        args.push(containerName, 'git', ...finalGitArgs);
      } else {
        cmd = 'git';
        args = finalGitArgs;
        spawnOpts.cwd = workspace.storagePath;
        if (gitSshCommand) {
          spawnOpts.env.GIT_SSH_COMMAND = gitSshCommand;
        }
      }

      console.log(`[GitService] Spawning: ${cmd} ${args.join(' ')}`);

      const child = spawn(cmd, args, spawnOpts);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const cleanup = () => {
        if (hostSshPath && fs.existsSync(hostSshPath)) {
          try {
            fs.unlinkSync(hostSshPath);
            console.log('[GitService] Secured temporary SSH private key file deleted.');
          } catch (err) {
            console.error('[GitService] Failed to delete temporary SSH private key:', err);
          }
        }
      };

      child.on('close', (code) => {
        cleanup();
        resolve({
          stdout,
          stderr,
          exitCode: code ?? 0,
        });
      });

      child.on('error', (err) => {
        cleanup();
        resolve({
          stdout: '',
          stderr: err.message,
          exitCode: -1,
        });
      });
    });
  }
}
