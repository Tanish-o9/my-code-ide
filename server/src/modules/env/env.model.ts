import { Schema, model, Document } from 'mongoose';

export interface IWorkspaceEnv extends Document {
  workspaceId: Schema.Types.ObjectId;
  key: string;
  value: string;
  isSecret: boolean;
}

const envSchema = new Schema<IWorkspaceEnv>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  key: { type: String, required: true },
  value: { type: String, required: true },
  isSecret: { type: Boolean, default: false },
});

export const WorkspaceEnv = model<IWorkspaceEnv>('WorkspaceEnv', envSchema);
