import { Router } from 'express';
import multer from 'multer';
import { 
  listFiles, 
  readFile, 
  writeFile, 
  createItem, 
  deleteItem, 
  renameItem,
  uploadFile
} from './filesystem.controller';
import { requireWorkspaceAccess } from '../../middleware/workspace-auth.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const router = Router({ mergeParams: true });

router.get('/', requireWorkspaceAccess('viewer') as any, listFiles as any);
router.get('/content', requireWorkspaceAccess('viewer') as any, readFile as any);
router.put('/content', requireWorkspaceAccess('editor') as any, writeFile as any);
router.post('/item', requireWorkspaceAccess('editor') as any, createItem as any);
router.delete('/item', requireWorkspaceAccess('editor') as any, deleteItem as any);
router.post('/rename', requireWorkspaceAccess('editor') as any, renameItem as any);
router.post('/upload', requireWorkspaceAccess('editor') as any, upload.single('file'), uploadFile as any);

export default router;
