import * as fs from 'fs';
import * as path from 'path';

export interface PackageManagerConfig {
  managerId: string;
  manifestFile: string;
  lockFile?: string;
  installCmd: string;
  addCmd: string;      // expects argument append {package}
  removeCmd: string;   // expects argument append {package}
  updateCmd: string;   // expects argument append {package}
}

export class PackageManagerRegistry {
  private static registry = new Map<string, PackageManagerConfig>();

  static {
    // 1. NPM
    this.register({
      managerId: 'npm',
      manifestFile: 'package.json',
      lockFile: 'package-lock.json',
      installCmd: 'npm install',
      addCmd: 'npm install {package}',
      removeCmd: 'npm uninstall {package}',
      updateCmd: 'npm update {package}'
    });

    // 2. YARN
    this.register({
      managerId: 'yarn',
      manifestFile: 'package.json',
      lockFile: 'yarn.lock',
      installCmd: 'yarn install',
      addCmd: 'yarn add {package}',
      removeCmd: 'yarn remove {package}',
      updateCmd: 'yarn upgrade {package}'
    });

    // 3. PNPM
    this.register({
      managerId: 'pnpm',
      manifestFile: 'package.json',
      lockFile: 'pnpm-lock.yaml',
      installCmd: 'pnpm install',
      addCmd: 'pnpm add {package}',
      removeCmd: 'pnpm remove {package}',
      updateCmd: 'pnpm update {package}'
    });

    // 4. PIP
    this.register({
      managerId: 'pip',
      manifestFile: 'requirements.txt',
      installCmd: 'pip install -r requirements.txt',
      addCmd: 'pip install {package}',
      removeCmd: 'pip uninstall -y {package}',
      updateCmd: 'pip install --upgrade {package}'
    });

    // 5. CARGO
    this.register({
      managerId: 'cargo',
      manifestFile: 'Cargo.toml',
      lockFile: 'Cargo.lock',
      installCmd: 'cargo build',
      addCmd: 'cargo add {package}',
      removeCmd: 'cargo rm {package}', // cargo-edit extension command
      updateCmd: 'cargo update -p {package}'
    });
  }

  public static register(config: PackageManagerConfig): void {
    this.registry.set(config.managerId, config);
  }

  public static get(managerId: string): PackageManagerConfig | null {
    return this.registry.get(managerId) || null;
  }

  /**
   * Detects the package manager(s) present in the workspace directory.
   * If ambiguity exists (competing lockfiles), returns details to prompt the user.
   */
  public static detect(workspaceDir: string): {
    detected: string | null;
    ambiguous: string[];
    manifestsFound: string[];
  } {
    const manifestsFound: string[] = [];
    const lockfilesFound: string[] = [];

    // Scan for manifests
    const manifestFiles = ['package.json', 'requirements.txt', 'pyproject.toml', 'Cargo.toml'];
    for (const file of manifestFiles) {
      if (fs.existsSync(path.join(workspaceDir, file))) {
        manifestsFound.push(file);
      }
    }

    // Scan for lockfiles
    const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock'];
    for (const file of lockFiles) {
      if (fs.existsSync(path.join(workspaceDir, file))) {
        lockfilesFound.push(file);
      }
    }

    // 1. Ambiguity check: check if multiple Node lockfiles exist
    const nodeLockfiles = lockfilesFound.filter(f => ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].includes(f));
    if (nodeLockfiles.length > 1) {
      const ambiguousManagers = nodeLockfiles.map(f => {
        if (f === 'package-lock.json') return 'npm';
        if (f === 'yarn.lock') return 'yarn';
        return 'pnpm';
      });
      return {
        detected: null,
        ambiguous: ambiguousManagers,
        manifestsFound
      };
    }

    // 2. Clear lockfile resolution
    if (lockfilesFound.length > 0) {
      const primaryLock = lockfilesFound[0];
      if (primaryLock === 'package-lock.json') return { detected: 'npm', ambiguous: [], manifestsFound };
      if (primaryLock === 'yarn.lock') return { detected: 'yarn', ambiguous: [], manifestsFound };
      if (primaryLock === 'pnpm-lock.yaml') return { detected: 'pnpm', ambiguous: [], manifestsFound };
      if (primaryLock === 'Cargo.lock') return { detected: 'cargo', ambiguous: [], manifestsFound };
    }

    // 3. Fallback to manifest detection
    if (manifestsFound.includes('Cargo.toml')) {
      return { detected: 'cargo', ambiguous: [], manifestsFound };
    }
    if (manifestsFound.includes('requirements.txt')) {
      return { detected: 'pip', ambiguous: [], manifestsFound };
    }
    if (manifestsFound.includes('package.json')) {
      // Default node manifest to npm
      return { detected: 'npm', ambiguous: [], manifestsFound };
    }

    return { detected: null, ambiguous: [], manifestsFound };
  }
}
