import mongoose, { Schema, Document } from 'mongoose';

export interface IAISettings extends Document {
  workspaceId: mongoose.Types.ObjectId;
  enabled: boolean;
  spendCap: number; // monthly or org cap in USD
  currentSpend: number; // accumulated spend
  requestCount: number; // count of calls
  createdAt: Date;
}

const AISettingsSchema = new Schema<IAISettings>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, unique: true },
  enabled: { type: Boolean, default: false }, // Default disabled (opt-in requirement)
  spendCap: { type: Number, default: 10.0 }, // Spend cap limit
  currentSpend: { type: Number, default: 0.0 },
  requestCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

export const AISettings = mongoose.model<IAISettings>('AISettings', AISettingsSchema);

export interface IAICredential extends Document {
  workspaceId: mongoose.Types.ObjectId;
  providerId: string; // 'openai' or 'anthropic'
  apiKey: string; // Encrypted using AES-256-GCM
  modelName: string;
  createdAt: Date;
}

const AICredentialSchema = new Schema<IAICredential>({
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
  providerId: { type: String, required: true },
  apiKey: { type: String, required: true }, // Encrypted at rest
  modelName: { type: String, default: 'mock-model' },
  createdAt: { type: Date, default: Date.now }
});

export const AICredential = mongoose.model<IAICredential>('AICredential', AICredentialSchema);
