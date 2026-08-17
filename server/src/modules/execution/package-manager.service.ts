import { Workspace } from '../workspaces/workspace.model';
import { PackageManagerRegistry } from './package-registry';
import { decrypt, encrypt } from '../../utils/crypto';
import mongoose, { Schema, Document } from 'mongoose';

export interface IPackageManagerCredential extends Document {
  workspaceId: mongoose.Types.ObjectId;
  managerId: string;
  registryUrl: string;
  authToken: string;
  createdAt: Date;
}

const PMCredentialSchema = new Schema<IPackageManagerCredential>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  managerId: { type: String, required: true },
  registryUrl: { type: String, required: true },
  authToken: { type: String, required: true }, // Encrypted at rest
  createdAt: { type: Date, default: Date.now }
});

export const PackageManagerCredential = mongoose.model<IPackageManagerCredential>(
  'PackageManagerCredential',
  PMCredentialSchema
);

export class PackageManagerService {
  /**
   * Detects the package manager for a workspace and returns the execution command.
   */
  public static async getCommand(
    workspaceId: string,
    action: 'install' | 'add' | 'remove' | 'update',
    packageName?: string
  ): Promise<{ command: string; managerId: string; registryEnv?: Record<string, string> }> {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found.');
    }

    const { detected, ambiguous } = PackageManagerRegistry.detect(workspace.storagePath);
    
    if (ambiguous.length > 0) {
      throw new Error(`Ambiguity detected. Multiple lockfiles present: ${ambiguous.join(', ')}`);
    }

    const managerId = detected || 'npm'; // Fallback to npm
    const config = PackageManagerRegistry.get(managerId);
    if (!config) {
      throw new Error(`Package manager config not found for: ${managerId}`);
    }

    // Resolve credentials env (Module 39G)
    const registryEnv: Record<string, string> = {};
    const credential = await PackageManagerCredential.findOne({ workspaceId, managerId });
    if (credential) {
      const decryptedToken = decrypt(credential.authToken);
      if (managerId === 'npm' || managerId === 'yarn' || managerId === 'pnpm') {
        registryEnv['NPM_TOKEN'] = decryptedToken;
      } else if (managerId === 'pip') {
        registryEnv['PIP_INDEX_URL'] = `${credential.registryUrl.replace('://', `://token:${decryptedToken}@`)}`;
      } else if (managerId === 'cargo') {
        registryEnv['CARGO_REGISTRY_TOKEN'] = decryptedToken;
      }
    }

    let cmdTemplate = '';
    if (action === 'install') cmdTemplate = config.installCmd;
    else if (action === 'add') cmdTemplate = config.addCmd;
    else if (action === 'remove') cmdTemplate = config.removeCmd;
    else if (action === 'update') cmdTemplate = config.updateCmd;

    const command = packageName 
      ? cmdTemplate.replace('{package}', packageName) 
      : cmdTemplate;

    return { command, managerId, registryEnv };
  }

  /**
   * Registers registry credentials for a workspace (Module 39G).
   */
  public static async setCredentials(
    workspaceId: string,
    managerId: string,
    registryUrl: string,
    authToken: string
  ): Promise<void> {
    const encryptedToken = encrypt(authToken);
    await PackageManagerCredential.findOneAndUpdate(
      { workspaceId, managerId },
      { registryUrl, authToken: encryptedToken },
      { upsert: true, new: true }
    );
  }
}
