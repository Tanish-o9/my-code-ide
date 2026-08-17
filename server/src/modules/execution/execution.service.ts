import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { Workspace } from '../workspaces/workspace.model';
import { WorkspaceRunnerService } from '../workspaces/workspace-runner.service';
import { LanguageExecutionRegistry } from './language-registry';
import * as fs from 'fs';
import { getLanguageFromPath } from '../../utils/language';

const execAsync = promisify(exec);

export interface ExecutionMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  timeouts: Record<string, number>;
  coldStarts: number;
  warmStarts: number;
}

export class ExecutionService {
  private static metrics: ExecutionMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    timeouts: {
      'db-lookup': 0,
      'container-start': 0,
      'compilation': 0,
      'interpreter-resolve': 0,
    },
    coldStarts: 0,
    warmStarts: 0,
  };

  public static getMetrics(): ExecutionMetrics {
    return this.metrics;
  }

  /**
   * Processes compile steps and returns the command to execute the code.
   */
  public static async run(
    workspaceId: string,
    filePath: string
  ): Promise<{ runCommand: string; staticPreview?: boolean; compileLog?: string }> {
    const traceStart = Date.now();
    const timestamp = () => `[${new Date().toISOString()}]`;
    this.metrics.totalExecutions++;

    console.log(`${timestamp()} [Execution Trace] [Hop 1: DB Lookup] Starting workspace query`);
    let workspace;
    try {
      workspace = await Workspace.findById(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found.');
      }
      console.log(`${timestamp()} [Execution Trace] [Hop 1: DB Lookup] Completed in ${Date.now() - traceStart}ms`);
    } catch (err) {
      this.metrics.failedExecutions++;
      this.metrics.timeouts['db-lookup']++;
      throw err;
    }

    // Touch keep-alive
    WorkspaceRunnerService.touch(workspaceId);

    const languageId = getLanguageFromPath(filePath);
    const config = LanguageExecutionRegistry.get(languageId);
    if (!config) {
      this.metrics.failedExecutions++;
      throw new Error(`Language execution not configured for: ${languageId}`);
    }

    // 1. Handle Static Preview (no PTY container execution)
    if (config.type === 'static-preview') {
      this.metrics.successfulExecutions++;
      return { runCommand: '', staticPreview: true };
    }

    // 2. Start container (resumes if stopped)
    console.log(`${timestamp()} [Execution Trace] [Hop 2: Sandbox Check] Verifying container runner status`);
    const statusStart = Date.now();
    const containerStatus = await WorkspaceRunnerService.getRunnerStatus(workspaceId);
    if (containerStatus.isRunning) {
      this.metrics.warmStarts++;
      console.log(`${timestamp()} [Execution Trace] [Hop 2: Sandbox Check] Container is already WARM`);
    } else {
      this.metrics.coldStarts++;
      console.log(`${timestamp()} [Execution Trace] [Hop 2: Sandbox Check] Container requires COLD start`);
    }

    console.log(`${timestamp()} [Execution Trace] [Hop 2: Sandbox Check] Starting/Resuming container`);
    let containerName;
    try {
      containerName = await WorkspaceRunnerService.startRunner(workspaceId, workspace.storagePath);
      console.log(`${timestamp()} [Execution Trace] [Hop 2: Sandbox Check] Container ready in ${Date.now() - statusStart}ms: containerName=${containerName}`);
    } catch (err) {
      this.metrics.failedExecutions++;
      this.metrics.timeouts['container-start']++;
      throw err;
    }

    // Resolve workspace relative paths
    const containerWorkdir = '/workspace';
    const cleanRelativePath = filePath.replace(/\\/g, '/');
    
    const containerFile = containerName 
      ? path.posix.join(containerWorkdir, cleanRelativePath) 
      : path.resolve(workspace.storagePath, cleanRelativePath);

    // Generate output binary name for compiled targets
    const binaryExt = process.platform === 'win32' && !containerName ? '.exe' : '.bin';
    const containerBinary = containerFile + binaryExt;

    // 3. Handle Compiled Pipeline (Compile-then-Run)
    if (config.type === 'compiled' && config.compileCommand) {
      const compileCmd = config.compileCommand
        .replace('{file}', `"${containerFile}"`)
        .replace('{binary}', `"${containerBinary}"`);

      console.log(`${timestamp()} [Execution Trace] [Hop 3: Compilation] Compiling target command: ${compileCmd}`);
      const compileStart = Date.now();

      try {
        if (containerName) {
          await execAsync(`docker exec ${containerName} sh -c "${compileCmd.replace(/"/g, '\\"')}"`);
        } else {
          await execAsync(compileCmd);
        }
        console.log(`${timestamp()} [Execution Trace] [Hop 3: Compilation] Completed in ${Date.now() - compileStart}ms`);
      } catch (err: any) {
        console.warn(`${timestamp()} [Execution Trace] [Hop 3: Compilation] Compilation failed:`, err.stderr || err.message);
        this.metrics.failedExecutions++;
        this.metrics.timeouts['compilation']++;
        return {
          runCommand: '',
          compileLog: err.stderr || err.stdout || err.message
        };
      }

      // Return compiled run command
      const runCmd = config.runCommand!.replace('{binary}', `"${containerBinary}"`);
      this.metrics.successfulExecutions++;
      return { runCommand: runCmd };
    }

    // 4. Handle Interpreted Pipeline
    if (config.type === 'interpreted' && config.interpreterCommand) {
      let interpreter = config.interpreterCommand;
      if (languageId === 'python') {
        const configured = workspace.settings?.pythonPath;
        let interpreterWorks = false;

        console.log(`${timestamp()} [Execution Trace] [Hop 4: Interpreter Resolution] Verifying Python config: ${configured || 'none'}`);
        const interpreterStart = Date.now();

        // 1. Check local workspace .venv or venv first (extremely fast under 1ms)
        const localVenv = path.join(workspace.storagePath, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
        const localVenv2 = path.join(workspace.storagePath, 'venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
        
        if (fs.existsSync(localVenv)) {
          interpreter = localVenv;
          interpreterWorks = true;
        } else if (fs.existsSync(localVenv2)) {
          interpreter = localVenv2;
          interpreterWorks = true;
        }

        // 2. Use configured interpreter path if specified
        if (!interpreterWorks && configured) {
          interpreter = configured;
          interpreterWorks = true;
        }

        // 3. Fallback to default 'python' executable
        if (!interpreterWorks) {
          interpreter = 'python';
        }

        console.log(`${timestamp()} [Execution Trace] [Hop 4: Interpreter Resolution] Completed in ${Date.now() - interpreterStart}ms, resolved path: ${interpreter}`);

        // Resolve virtual environment activation command
        const normPath = interpreter.replace(/\\/g, '/');
        const isWin = process.platform === 'win32' && !containerName;
        let activateCmd = '';

        if (normPath.includes('/.venv/') || normPath.includes('/venv/') || normPath.includes('/env/')) {
          let venvRoot = '';
          if (normPath.includes('/Scripts/python.exe')) {
            venvRoot = interpreter.substring(0, normPath.indexOf('/Scripts/python.exe'));
          } else if (normPath.includes('/bin/python')) {
            venvRoot = interpreter.substring(0, normPath.indexOf('/bin/python'));
          }

          if (venvRoot) {
            if (isWin) {
              const activateScript = path.resolve(venvRoot, 'Scripts', 'Activate.ps1');
              if (fs.existsSync(activateScript)) {
                activateCmd = `& "${activateScript}" ; `;
              }
            } else {
              const activateScript = containerName
                ? path.posix.join(venvRoot, 'bin', 'activate')
                : path.resolve(venvRoot, 'bin', 'activate');
              activateCmd = `source "${activateScript}" && `;
            }
          }
        }

        const absoluteFile = containerFile;
        const relativeFile = path.relative(workspace.storagePath, absoluteFile).replace(/\\/g, '/');
        
        let runCmd = '';
        if (isWin) {
          const escapedInterpreter = interpreter.includes(' ') ? `& "${interpreter}"` : interpreter;
          runCmd = `${activateCmd}$start = Get-Date ; Write-Host "python ${relativeFile}" ; ${escapedInterpreter} "${absoluteFile}" ; $elapsed = [Math]::Round(((Get-Date) - $start).TotalMilliseconds) ; Write-Host "Process exited with code $LastExitCode in \${elapsed}ms"`;
        } else {
          runCmd = `${activateCmd}start=\$(date +%s%3N); echo "python ${relativeFile}"; ${interpreter} "${absoluteFile}"; exit_code=\$?; elapsed=\$((\$(date +%s%3N) - start)); echo "Process exited with code \$exit_code in \${elapsed}ms"`;
        }
        
        this.metrics.successfulExecutions++;
        return { runCommand: runCmd };
      }
      
      const runCmd = `${interpreter} "${containerFile}"`;
      this.metrics.successfulExecutions++;
      return { runCommand: runCmd };
    }

    throw new Error(`Unsupported execution format: ${config.type}`);
  }
}
