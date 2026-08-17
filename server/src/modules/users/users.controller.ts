import { Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth.middleware';
import { User } from './user.model';

export const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      theme_preference: user.theme_preference,
      createdAt: user.createdAt,
    });
  } catch (error: any) {
    console.error('[Users/GetMe] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
