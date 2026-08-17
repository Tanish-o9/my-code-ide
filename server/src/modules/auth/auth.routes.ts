import { Router } from 'express';
import { register, login, refresh, logout, ssoCallback } from './auth.controller';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/sso/callback', ssoCallback);

export default router;
