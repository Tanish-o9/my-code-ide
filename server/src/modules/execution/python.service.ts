import { exec, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { Workspace } from '../workspaces/workspace.model';
import { WorkspaceRunnerService } from '../workspaces/workspace-runner.service';

export interface PythonInterpreter {
  name: string;
  version: string;
  path: string;
  type: 'global' | 'venv' | 'conda';
}

export class PythonService {
  /**
   * Helper to execute shell commands in workspace sandbox or fallback host
   */
  public static async runCommand(workspaceId: string, cmdArgs: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    const containerName = await WorkspaceRunnerService.startRunner(workspaceId, workspace.storagePath);

    return new Promise((resolve) => {
      // Prevent launching Microsoft App Store stub dialog hangs
      if (cmdArgs[0] && cmdArgs[0].toLowerCase().includes('windowsapps')) {
        resolve({ stdout: '', stderr: 'Bypassed Microsoft App Store Python stub.', exitCode: -1 });
        return;
      }

      let cmd: string;
      let args: string[];
      let spawnOpts: any = { env: { ...process.env } };

      if (containerName) {
        cmd = 'docker';
        args = ['exec', '-w', '/workspace', containerName, ...cmdArgs];
      } else {
        cmd = cmdArgs[0];
        args = cmdArgs.slice(1);
        spawnOpts.cwd = workspace.storagePath;
      }

      const child = spawn(cmd, args, spawnOpts);
      let stdout = '';
      let stderr = '';

      // Strict 1.2-second process timeout protection
      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch (e) {}
        resolve({ stdout: stdout.trim(), stderr: 'Execution check timed out.', exitCode: -1 });
      }, 1200);

      child.stdout.on('data', (data) => stdout += data.toString());
      child.stderr.on('data', (data) => stderr += data.toString());

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 0 });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ stdout: '', stderr: err.message, exitCode: -1 });
      });
    });
  }

  /**
   * Detect all Python interpreters
   */
  public static async detectInterpreters(workspaceId: string): Promise<PythonInterpreter[]> {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) return [];

    const interpreters: PythonInterpreter[] = [];
    const containerName = await WorkspaceRunnerService.startRunner(workspaceId, workspace.storagePath);

    if (containerName) {
      // In sandbox, look for python3, python, or active virtualenvs
      const paths = [
        '/workspace/.venv/bin/python',
        '/workspace/venv/bin/python',
        '/workspace/env/bin/python',
        '/usr/bin/python3',
        '/usr/bin/python'
      ];
      
      const checkPromises = paths.map(async (p) => {
        try {
          const run = await this.runCommand(workspaceId, [p, '--version']);
          if (run.exitCode === 0) {
            const isVenv = p.includes('/.venv/') || p.includes('/venv/') || p.includes('/env/');
            return {
              name: isVenv ? `Virtual Environment (${p.split('/')[2]})` : 'System Python',
              version: run.stdout || 'Python 3',
              path: p,
              type: isVenv ? 'venv' : 'global' as const,
            };
          }
        } catch (err) {}
        return null;
      });

      const results = await Promise.all(checkPromises);
      for (const r of results) {
        if (r) interpreters.push(r);
      }
    } else {
      // On local fallback (Windows / macOS / Linux Host)
      const isWin = process.platform === 'win32';
      
      const getVersion = (pyPath: string): Promise<string> => {
        return new Promise((resolve) => {
          if (pyPath.toLowerCase().includes('windowsapps')) {
            resolve('Bypassed App Store Stub');
            return;
          }
          const timer = setTimeout(() => {
            resolve('Timeout');
          }, 3000);
          
          exec(`"${pyPath}" --version`, (err, stdout, stderr) => {
            clearTimeout(timer);
            resolve((stdout || stderr || '').trim());
          });
        });
      };

      const runExec = (cmd: string, cwd: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error('Command timed out'));
          }, 3000);
          
          exec(cmd, { cwd }, (err, stdout) => {
            clearTimeout(timer);
            if (err) reject(err);
            else resolve(stdout);
          });
        });
      };

      // 1. Scan workspace root for virtual environments (.venv, venv, env)
      const commonVenvDirs = ['.venv', 'venv', 'env'];
      for (const dir of commonVenvDirs) {
        const venvRoot = path.join(workspace.storagePath, dir);
        const pyPath = isWin 
          ? path.join(venvRoot, 'Scripts', 'python.exe')
          : path.join(venvRoot, 'bin', 'python');
        if (fs.existsSync(pyPath)) {
          const version = await getVersion(pyPath);
          interpreters.push({
            name: `Virtual Environment (${dir})`,
            version: version || 'Python 3',
            path: pyPath,
            type: 'venv'
          });
        }
      }

      // 2. Scan PATH for python, python3, py (avoiding duplicates)
      const pathLookups = isWin ? ['python', 'python3', 'py'] : ['python3', 'python', 'py'];
      const globalPathsSet = new Set<string>();
      for (const lookup of pathLookups) {
        try {
          const stdout = await runExec(isWin ? `where.exe ${lookup}` : `which -a ${lookup}`, workspace.storagePath);
          const foundPaths = stdout.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
          for (const p of foundPaths) {
            const resolvedPath = path.resolve(p);
            // Avoid adding App Store stub if it is not initialized (usually 0 bytes or throws, or we can filter it)
            if (fs.existsSync(p) && !globalPathsSet.has(resolvedPath)) {
              globalPathsSet.add(resolvedPath);
              const version = await getVersion(p);
              interpreters.push({
                name: `Global Python (${lookup})`,
                version: version || 'Python 3',
                path: p,
                type: 'global'
              });
            }
          }
        } catch (e) {}
      }

      // 3. Scan for Conda environments
      try {
        const condaOut = await runExec('conda env list --json', workspace.storagePath);
        const condaJson = JSON.parse(condaOut);
        if (condaJson && Array.isArray(condaJson.envs)) {
          for (const envPath of condaJson.envs) {
            const condaPy = isWin 
              ? path.join(envPath, 'python.exe')
              : path.join(envPath, 'bin', 'python');
            if (fs.existsSync(condaPy)) {
              const version = await getVersion(condaPy);
              const envName = path.basename(envPath);
              interpreters.push({
                name: `Conda Environment (${envName})`,
                version: version || 'Python 3',
                path: condaPy,
                type: 'conda'
              });
            }
          }
        }
      } catch (e) {}

      // 4. Scan for Poetry environment
      try {
        const poetryOut = await runExec('poetry env info -p', workspace.storagePath);
        const poetryPath = poetryOut.trim();
        if (poetryPath) {
          const poetryPy = isWin
            ? path.join(poetryPath, 'Scripts', 'python.exe')
            : path.join(poetryPath, 'bin', 'python');
          if (fs.existsSync(poetryPy)) {
            const version = await getVersion(poetryPy);
            interpreters.push({
              name: 'Poetry Environment',
              version: version || 'Python 3',
              path: poetryPy,
              type: 'venv'
            });
          }
        }
      } catch (e) {}

      // 5. Scan for Pipenv environment
      try {
        const pipenvOut = await runExec('pipenv --venv', workspace.storagePath);
        const pipenvPath = pipenvOut.trim();
        if (pipenvPath) {
          const pipenvPy = isWin
            ? path.join(pipenvPath, 'Scripts', 'python.exe')
            : path.join(pipenvPath, 'bin', 'python');
          if (fs.existsSync(pipenvPy)) {
            const version = await getVersion(pipenvPy);
            interpreters.push({
              name: 'Pipenv Environment',
              version: version || 'Python 3',
              path: pipenvPy,
              type: 'venv'
            });
          }
        }
      } catch (e) {}

      // 6. Scan for WSL Python (Windows host only)
      if (isWin) {
        try {
          const wslOut = await runExec('wsl which python3', workspace.storagePath);
          const wslPath = wslOut.trim();
          if (wslPath && wslPath.startsWith('/')) {
            const wslVer = await runExec('wsl python3 --version', workspace.storagePath);
            interpreters.push({
              name: 'WSL Python3',
              version: wslVer.trim() || 'Python 3',
              path: `wsl ${wslPath}`,
              type: 'global'
            });
          }
        } catch (e) {}
      }
    }

    return interpreters;
  }

  /**
   * Run custom python code block (e.g. Jupyter notebook cell execution)
   */
  public static async runCodeBlock(workspaceId: string, code: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    // Create a temporary file cell_exec.py
    const tempFile = path.join(workspace.storagePath, '.cell_exec.py');
    fs.writeFileSync(tempFile, code, 'utf8');

    // Run this file
    const pythonBin = workspace.settings.pythonPath || 'python3';
    const result = await this.runCommand(workspaceId, [pythonBin, '.cell_exec.py']);

    // Cleanup
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (err) {}

    return result;
  }
}
