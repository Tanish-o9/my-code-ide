import { Router } from 'express';
import { getMe } from './users.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();

router.get('/me', authMiddleware as any, getMe);

export default router;
