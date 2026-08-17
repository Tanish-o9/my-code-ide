import mongoose, { Schema, Document } from 'mongoose';
import { encrypt, decrypt } from '../../utils/crypto';

export interface IGitCredential extends Document {
  workspaceId: mongoose.Types.ObjectId;
  authType: 'token' | 'ssh';
  tokenEncrypted?: string;
  sshPrivateKeyEncrypted?: string;
  sshPublicKey?: string;
  remoteUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Helpers
  getToken: () => string;
  setToken: (val: string) => void;
  getSshPrivateKey: () => string;
  setSshPrivateKey: (val: string) => void;
}

const GitCredentialSchema = new Schema<IGitCredential>(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
    authType: { type: String, enum: ['token', 'ssh'], required: true },
    tokenEncrypted: { type: String },
    sshPrivateKeyEncrypted: { type: String },
    sshPublicKey: { type: String },
    remoteUrl: { type: String },
  },
  { timestamps: true }
);

// Encrypt/Decrypt helpers
GitCredentialSchema.methods.getToken = function (this: IGitCredential): string {
  return this.tokenEncrypted ? decrypt(this.tokenEncrypted) : '';
};

GitCredentialSchema.methods.setToken = function (this: IGitCredential, val: string): void {
  this.tokenEncrypted = val ? encrypt(val) : undefined;
};

GitCredentialSchema.methods.getSshPrivateKey = function (this: IGitCredential): string {
  return this.sshPrivateKeyEncrypted ? decrypt(this.sshPrivateKeyEncrypted) : '';
};

GitCredentialSchema.methods.setSshPrivateKey = function (this: IGitCredential, val: string): void {
  this.sshPrivateKeyEncrypted = val ? encrypt(val) : undefined;
};

export const GitCredential = mongoose.model<IGitCredential>('GitCredential', GitCredentialSchema);
