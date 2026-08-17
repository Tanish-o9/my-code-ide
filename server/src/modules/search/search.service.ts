import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface SearchMatch {
  file: string; // Relative to workspace root
  lineNumber: number;
  lineContent: string;
  matchIndex: number;
  matchLength: number;
}

export interface SearchOptions {
  caseSensitive: boolean;
  isRegex: boolean;
  wholeWord: boolean;
  includes?: string[];
  excludes?: string[];
}

export class GlobalSearchService {
  private static isRgAvailable: boolean | null = null;

  /**
   * Checks if ripgrep CLI is installed on the host OS.
   */
  public static checkRipgrep(): boolean {
    if (this.isRgAvailable !== null) return this.isRgAvailable;
    try {
      execSync('rg --version', { stdio: 'ignore' });
      this.isRgAvailable = true;
      console.log('[GlobalSearch] Ripgrep is available. Enabling native search.');
    } catch (err) {
      this.isRgAvailable = false;
      console.warn('[GlobalSearch] Ripgrep is not available. Using pure JS fallback.');
    }
    return this.isRgAvailable;
  }

  /**
   * Main search entrypoint. Escapes variables and routes execution.
   */
  public static async search(
    workspaceRoot: string,
    query: string,
    options: SearchOptions,
    onMatch: (match: SearchMatch) => void
  ): Promise<void> {
    // 1. Path Traversal Guard: Resolve and sanitize root directory path
    const absoluteRoot = path.resolve(workspaceRoot);
    if (!fs.existsSync(absoluteRoot)) {
      throw new Error('Workspace directory not found');
    }

    if (!query) return;

    const hasRg = this.checkRipgrep();
    if (hasRg) {
      await this.nativeSearch(absoluteRoot, query, options, onMatch);
    } else {
      await this.fallbackSearch(absoluteRoot, query, options, onMatch);
    }
  }

  /**
   * Ripgrep search running in JSON mode to stream results securely.
   */
  private static nativeSearch(
    workspaceRoot: string,
    query: string,
    options: SearchOptions,
    onMatch: (match: SearchMatch) => void
  ): Promise<void> {
    return new Promise((resolve) => {
      const args: string[] = ['--json', '--line-number', '--column'];

      // Configure casing
      if (!options.caseSensitive) {
        args.push('-i');
      }

      // Configure word matching
      if (options.wholeWord) {
        args.push('-w');
      }

      // Configure literal matching
      if (!options.isRegex) {
        args.push('-F');
      }

      // Configure glob exclusions (e.g. node_modules, git)
      const defaultExcludes = ['node_modules', '.git', 'dist', 'build', '.gemini', 'tmp'];
      const activeExcludes = [...defaultExcludes, ...(options.excludes || [])];
      
      activeExcludes.forEach((pattern) => {
        args.push('-g', `!**/${pattern}/**`);
      });

      if (options.includes && options.includes.length > 0) {
        options.includes.forEach((pattern) => {
          args.push('-g', pattern);
        });
      }

      // Query argument (safe from shell injection since we pass via spawn argument array)
      args.push(query);
      args.push('.');

      console.log(`[GlobalSearch/Native] Executing: rg ${args.join(' ')}`);

      const child = spawn('rg', args, { cwd: workspaceRoot });
      let buffer = '';

      child.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        // Keep the last partial line
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const resultObj = JSON.parse(line);
            if (resultObj.type === 'match') {
              const dataObj = resultObj.data;
              const relPath = dataObj.path.text.replace(/\\/g, '/');
              const lineNumber = dataObj.line_number;
              const lineContent = dataObj.lines.text.replace(/\r?\n$/, '');

              for (const submatch of dataObj.submatches) {
                onMatch({
                  file: relPath,
                  lineNumber,
                  lineContent,
                  matchIndex: submatch.start,
                  matchLength: submatch.end - submatch.start,
                });
              }
            }
          } catch (err) {
            // JSON parsing error or empty payload line
          }
        }
      });

      child.on('close', () => {
        resolve();
      });
    });
  }

  /**
   * Pure JS search traversal fallback if Ripgrep is missing on host.
   */
  private static async fallbackSearch(
    workspaceRoot: string,
    query: string,
    options: SearchOptions,
    onMatch: (match: SearchMatch) => void
  ): Promise<void> {
    const defaultExcludes = ['node_modules', '.git', 'dist', 'build', '.gemini', 'tmp'];
    const activeExcludes = [...defaultExcludes, ...(options.excludes || [])];

    // Build regex search pattern
    let regex: RegExp;
    const flags = options.caseSensitive ? 'g' : 'gi';
    
    if (options.isRegex) {
      try {
        regex = new RegExp(query, flags);
      } catch (err) {
        return; // Mismatched regex pattern
      }
    } else {
      // Escape special regex characters for literal match
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = options.wholeWord ? `\\b${escaped}\\b` : escaped;
      regex = new RegExp(pattern, flags);
    }

    const traverse = (dir: string) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const relPath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');

        // Check exclusions
        if (activeExcludes.some((exclude) => relPath.includes(exclude) || file === exclude)) {
          continue;
        }

        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          traverse(fullPath);
        } else if (stat.isFile()) {
          // Simple check for text files
          const ext = file.split('.').pop()?.toLowerCase();
          const isText = !ext || ['txt', 'ts', 'tsx', 'js', 'jsx', 'json', 'py', 'md', 'html', 'css', 'yml', 'yaml', 'xml', 'sh'].includes(ext);
          if (!isText) continue;

          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split(/\r?\n/);
            
            lines.forEach((lineContent, index) => {
              regex.lastIndex = 0;
              let match;
              while ((match = regex.exec(lineContent)) !== null) {
                onMatch({
                  file: relPath,
                  lineNumber: index + 1,
                  lineContent,
                  matchIndex: match.index,
                  matchLength: match[0].length,
                });
                if (regex.lastIndex === 0) break; // Avoid infinite loop
              }
            });
          } catch (err) {
            // Ignore unreadable files
          }
        }
      }
    };

    try {
      traverse(workspaceRoot);
    } catch (err) {
      console.error('[GlobalSearch/Fallback] Error traversing directory:', err);
    }
  }
}
