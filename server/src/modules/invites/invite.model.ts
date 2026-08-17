import { Schema, model, Document } from 'mongoose';

export interface IWorkspaceInvite extends Document {
  workspaceId: Schema.Types.ObjectId;
  email: string;
  role: 'viewer' | 'editor' | 'admin';
  token: string;
  expiry: Date;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: Date;
}

const inviteSchema = new Schema<IWorkspaceInvite>({
  workspaceId: {
    type: Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['viewer', 'editor', 'admin'],
    default: 'editor',
  },
  token: {
    type: String,
    required: true,
    unique: true,
  },
  expiry: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'expired'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const WorkspaceInvite = model<IWorkspaceInvite>('WorkspaceInvite', inviteSchema);
