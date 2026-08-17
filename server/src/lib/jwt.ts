import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

export interface TokenPayload {
  userId: string;
  email: string;
}

export const generateAccessToken = (userId: string, email: string): string => {
  return jwt.sign(
    { userId, email },
    config.JWT_SECRET,
    { expiresIn: '15m' }
  );
};

export const generateRefreshToken = (userId: string): string => {
  return jwt.sign(
    { userId },
    config.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.JWT_SECRET) as TokenPayload;
};

export const verifyRefreshToken = (token: string): { userId: string } => {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as { userId: string };
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};
