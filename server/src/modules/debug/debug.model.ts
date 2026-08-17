import mongoose, { Schema, Document } from 'mongoose';

export interface ILaunchConfiguration extends Document {
  workspaceId: mongoose.Types.ObjectId;
  name: string;
  adapterType: 'node' | 'python';
  program: string;
  args: string[];
  env: Record<string, string>;
  mode: 'launch' | 'attach';
}

const LaunchConfigurationSchema: Schema = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  name: { type: String, required: true },
  adapterType: { type: String, enum: ['node', 'python'], required: true },
  program: { type: String, required: true },
  args: { type: [String], default: [] },
  env: { type: Map, of: String, default: {} },
  mode: { type: String, enum: ['launch', 'attach'], default: 'launch' },
});

export const LaunchConfiguration = mongoose.model<ILaunchConfiguration>('LaunchConfiguration', LaunchConfigurationSchema);

export interface IBreakpoint extends Document {
  workspaceId: mongoose.Types.ObjectId;
  filePath: string;
  line: number;
  enabled: boolean;
  condition?: string;
  logMessage?: string;
}

const BreakpointSchema: Schema = new Schema({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  filePath: { type: String, required: true },
  line: { type: Number, required: true },
  enabled: { type: Boolean, default: true },
  condition: { type: String },
  logMessage: { type: String },
});

export const Breakpoint = mongoose.model<IBreakpoint>('Breakpoint', BreakpointSchema);
