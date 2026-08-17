import { Router } from 'express';
import { ExtensionController } from './extension.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Installed Extensions Management
router.get('/installed', authMiddleware as any, ExtensionController.getInstalledExtensions as any);
router.post('/install', authMiddleware as any, ExtensionController.installExtension as any);
router.post('/toggle/:id', authMiddleware as any, ExtensionController.toggleExtension as any);
router.delete('/uninstall/:id', authMiddleware as any, ExtensionController.uninstallExtension as any);
router.post('/install-vsix', authMiddleware as any, upload.single('vsix'), ExtensionController.installVsix as any);

// Settings
router.put('/settings/:id', authMiddleware as any, ExtensionController.updateExtensionSettings as any);

// Marketplace Discovery
router.get('/marketplace', authMiddleware as any, ExtensionController.getMarketplaceListings as any);
router.post('/publish', authMiddleware as any, ExtensionController.publishExtension as any);
router.post('/rate', authMiddleware as any, ExtensionController.rateExtension as any);

export default router;
