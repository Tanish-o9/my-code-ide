import { Request, Response, NextFunction } from 'express';
import { Socket } from 'socket.io';
import { verifyAccessToken } from '../lib/jwt';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export const authMiddleware = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication token required' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
};

export const socketAuthMiddleware = (socket: Socket, next: (err?: Error) => void): void => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    next(new Error('Authentication token required'));
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    socket.data.user = {
      userId: decoded.userId,
      email: decoded.email,
    };
    next();
  } catch (error) {
    next(new Error('Invalid or expired authentication token'));
  }
};
