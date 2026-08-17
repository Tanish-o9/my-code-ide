import { Schema, model, Document } from 'mongoose';

export interface IExtensionManifest {
  name: string;
  version: string;
  publisher: string;
  description?: string;
  activationEvents: string[];
  permissions: string[];
  settingsSchema?: Record<string, {
    type: 'string' | 'number' | 'boolean';
    default: any;
    description?: string;
  }>;
  entryPath: string; // File path to execution entry file
}

export interface IInstalledExtension extends Document {
  extensionId: string; // e.g. "publisher.name"
  manifest: IExtensionManifest;
  active: boolean;
  settings: Record<string, any>;
  createdAt: Date;
}

export interface IExtensionListing extends Document {
  extensionId: string;
  name: string;
  publisher: string;
  description: string;
  latestVersion: string;
  versions: {
    version: string;
    entryPath: string;
    manifest: IExtensionManifest;
    createdAt: Date;
  }[];
  reviewStatus: 'pending' | 'approved' | 'rejected';
  malwareCheckResult?: 'clean' | 'flagged';
  downloadCount: number;
  categories: string[];
  rating: number;
  ratingCount: number;
}

const ExtensionManifestSchema = new Schema<IExtensionManifest>({
  name: { type: String, required: true },
  version: { type: String, required: true },
  publisher: { type: String, required: true },
  description: { type: String },
  activationEvents: [{ type: String }],
  permissions: [{ type: String }],
  settingsSchema: { type: Map, of: Object },
  entryPath: { type: String, required: true }
}, { _id: false });

const InstalledExtensionSchema = new Schema<IInstalledExtension>({
  extensionId: { type: String, required: true, unique: true },
  manifest: { type: ExtensionManifestSchema, required: true },
  active: { type: Boolean, default: true },
  settings: { type: Map, of: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const ExtensionListingSchema = new Schema<IExtensionListing>({
  extensionId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  publisher: { type: String, required: true },
  description: { type: String, required: true },
  latestVersion: { type: String, required: true },
  versions: [{
    version: { type: String, required: true },
    entryPath: { type: String, required: true },
    manifest: { type: ExtensionManifestSchema, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  reviewStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  malwareCheckResult: { type: String, enum: ['clean', 'flagged'] },
  downloadCount: { type: Number, default: 0 },
  categories: [{ type: String, default: ['Other'] }],
  rating: { type: Number, default: 4.5 },
  ratingCount: { type: Number, default: 1 }
});

export const InstalledExtension = model<IInstalledExtension>('InstalledExtension', InstalledExtensionSchema);
export const ExtensionListing = model<IExtensionListing>('ExtensionListing', ExtensionListingSchema);
