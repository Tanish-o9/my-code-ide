import { Schema, model, Document } from 'mongoose';

export interface IRunConfiguration extends Document {
  workspaceId: Schema.Types.ObjectId;
  name: string;
  command: string;
  workingDirectory?: string;
  envOverrides?: Map<string, string>;
}

const runConfigSchema = new Schema<IRunConfiguration>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true },
  command: { type: String, required: true },
  workingDirectory: { type: String },
  envOverrides: { type: Map, of: String },
});

export const RunConfiguration = model<IRunConfiguration>('RunConfiguration', runConfigSchema);
