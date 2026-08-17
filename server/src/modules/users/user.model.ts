import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  avatar?: string;
  theme_preference: 'light' | 'dark';
  createdAt: Date;
  lastLoginAt?: Date;
  comparePassword(password: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>({
  name: { 
    type: String, 
    required: [true, 'Name is required'],
    trim: true,
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address'],
  },
  passwordHash: { 
    type: String, 
    required: [true, 'Password hash is required'],
    select: false, // Hidden by default from queries
  },
  avatar: { 
    type: String, 
    default: '',
  },
  theme_preference: { 
    type: String, 
    enum: ['light', 'dark'], 
    default: 'dark', 
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
  },
  lastLoginAt: { 
    type: Date,
  }
});

// Pre-save hook: Hash password if modified
userSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('passwordHash')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.passwordHash);
};

export const User = model<IUser>('User', userSchema);
