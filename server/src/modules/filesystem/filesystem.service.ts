import fs from 'fs';
import path from 'path';

export interface FileNodeInfo {
  name: string;
  path: string; // Relative to workspace root
  type: 'file' | 'folder';
  size?: number;
  lastModified?: Date;
}

export class FileSystemService {
  /**
   * Resolves a relative path within a workspace and verifies it doesn't escape the workspace root.
   * Throws an error if path traversal is detected.
   */
  public static resolveSafePath(workspaceRoot: string, relativePath: string): string {
    const absoluteRoot = path.resolve(workspaceRoot);
    // Combine and resolve
    const resolvedPath = path.resolve(path.join(absoluteRoot, relativePath));

    // Must start with the workspace root directory
    if (resolvedPath !== absoluteRoot && !resolvedPath.startsWith(absoluteRoot + path.sep)) {
      throw new Error('Access Denied: Path traversal detected.');
    }

    return resolvedPath;
  }

  /**
   * Lists the contents of a directory.
   */
  public static listDirectory(workspaceRoot: string, dirPath: string = ''): FileNodeInfo[] {
    const safePath = this.resolveSafePath(workspaceRoot, dirPath);
    
    if (!fs.existsSync(safePath)) {
      throw new Error('Directory not found');
    }

    const stat = fs.statSync(safePath);
    if (!stat.isDirectory()) {
      throw new Error('Path is not a directory');
    }

    // Load gitignore rules if .gitignore exists (Module 71)
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    const rules: RegExp[] = [];
    
    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        content.split('\n').forEach((line) => {
          const rule = line.trim();
          if (!rule || rule.startsWith('#')) return;
          
          let rStr = rule;
          const isDirOnly = rStr.endsWith('/');
          if (isDirOnly) {
            rStr = rStr.slice(0, -1);
          }
          
          let regexStr = rStr
            .replace(/[-\/\\^$*+?.()|[\]{}]/g, (m) => {
              if (m === '*') return '.*';
              if (m === '?') return '.';
              if (m === '/') return '\\/';
              return '\\' + m;
            });
            
          if (!rStr.startsWith('/')) {
            regexStr = '(^|\\/)' + regexStr;
          } else {
            regexStr = '^' + regexStr.slice(1);
          }
          
          if (isDirOnly) {
            regexStr += '\\/.*';
          } else {
            regexStr += '($|\\/.*)';
          }
          
          rules.push(new RegExp(regexStr));
        });
      } catch (err) {
        console.error('Failed to parse .gitignore:', err);
      }
    }

    const files = fs.readdirSync(safePath);
    const nodes: FileNodeInfo[] = [];

    for (const file of files) {
      if (file === '.git') continue; // Always ignore git internal folder

      const filePath = path.join(safePath, file);
      try {
        const fileStat = fs.statSync(filePath);
        const relPath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');

        // Check against gitignore rules
        const isIgnored = rules.some((rule) => rule.test(relPath));
        if (isIgnored) continue;

        nodes.push({
          name: file,
          path: relPath,
          type: fileStat.isDirectory() ? 'folder' : 'file',
          size: fileStat.isFile() ? fileStat.size : undefined,
          lastModified: fileStat.mtime,
        });
      } catch (statErr) {
        // Skip inaccessible files or junctions (common on Windows system paths)
        console.warn(`[FileSystemService] Skipping inaccessible file/folder: ${filePath}`);
      }
    }

    return nodes;
  }

  /**
   * Reads a file's content.
   */
  public static readFile(workspaceRoot: string, filePath: string): string {
    const safePath = this.resolveSafePath(workspaceRoot, filePath);
    
    if (!fs.existsSync(safePath)) {
      throw new Error('File not found');
    }

    const stat = fs.statSync(safePath);
    if (!stat.isFile()) {
      throw new Error('Path is not a file');
    }

    return fs.readFileSync(safePath, 'utf8');
  }

  /**
   * Writes content to a file (creates if not exists).
   */
  public static writeFile(workspaceRoot: string, filePath: string, content: string | Buffer): void {
    const safePath = this.resolveSafePath(workspaceRoot, filePath);
    
    // Ensure parent directory exists
    const parentDir = path.dirname(safePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(safePath, content);
  }

  /**
   * Creates a directory.
   */
  public static createDirectory(workspaceRoot: string, dirPath: string): void {
    const safePath = this.resolveSafePath(workspaceRoot, dirPath);
    
    if (fs.existsSync(safePath)) {
      throw new Error('Directory already exists');
    }

    fs.mkdirSync(safePath, { recursive: true });
  }

  /**
   * Deletes a file or directory.
   */
  public static deletePath(workspaceRoot: string, targetPath: string): void {
    const safePath = this.resolveSafePath(workspaceRoot, targetPath);
    
    if (!fs.existsSync(safePath)) {
      throw new Error('Path not found');
    }

    const stat = fs.statSync(safePath);
    if (stat.isDirectory()) {
      fs.rmSync(safePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(safePath);
    }
  }

  /**
   * Renames or moves a file or directory.
   */
  public static renamePath(workspaceRoot: string, oldPath: string, newPath: string): void {
    const safeOldPath = this.resolveSafePath(workspaceRoot, oldPath);
    const safeNewPath = this.resolveSafePath(workspaceRoot, newPath);

    if (!fs.existsSync(safeOldPath)) {
      throw new Error('Source path not found');
    }

    if (fs.existsSync(safeNewPath)) {
      throw new Error('Target path already exists');
    }

    // Ensure parent of target exists
    const parentDir = path.dirname(safeNewPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.renameSync(safeOldPath, safeNewPath);
  }
}
