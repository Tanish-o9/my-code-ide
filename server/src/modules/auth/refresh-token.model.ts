import { Schema, model, Document } from 'mongoose';

export interface IRefreshToken extends Document {
  userId: Schema.Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // Automatically delete document when expiresAt is reached
  },
});

export const RefreshToken = model<IRefreshToken>('RefreshToken', refreshTokenSchema);
