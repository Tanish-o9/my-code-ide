import { Response } from 'express';
import { WorkspaceRequest } from '../../middleware/workspace-auth.middleware';
import { FileSystemService } from './filesystem.service';
import { Server } from 'socket.io';

const getFsNamespace = (req: WorkspaceRequest) => {
  const io = req.app.get('io') as Server;
  return io.of('/ws/filesystem');
};

export const listFiles = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const relPath = (req.query.path as string) || '';
    
    const contents = FileSystemService.listDirectory(workspace.storagePath, relPath);
    res.status(200).json(contents);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to list files' });
  }
};

export const readFile = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const relPath = req.query.path as string;

    if (!relPath) {
      res.status(400).json({ error: 'File path parameter required' });
      return;
    }

    const content = FileSystemService.readFile(workspace.storagePath, relPath);
    res.status(200).json({ content });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to read file' });
  }
};

export const writeFile = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const { path: relPath, content } = req.body;

    if (!relPath || content === undefined) {
      res.status(400).json({ error: 'File path and content are required' });
      return;
    }

    FileSystemService.writeFile(workspace.storagePath, relPath, content);
    
    // Broadcast file change to collaboration room
    const fsNamespace = getFsNamespace(req);
    fsNamespace.to(workspace.id).emit('file:changed', { path: relPath });

    res.status(200).json({ message: 'File saved successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to write file' });
  }
};

export const createItem = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const { path: relPath, type } = req.body;

    if (!relPath || !type || (type !== 'file' && type !== 'folder')) {
      res.status(400).json({ error: 'Path and type (file/folder) are required' });
      return;
    }

    if (type === 'file') {
      FileSystemService.writeFile(workspace.storagePath, relPath, '');
    } else {
      FileSystemService.createDirectory(workspace.storagePath, relPath);
    }

    // Broadcast file creation
    const fsNamespace = getFsNamespace(req);
    fsNamespace.to(workspace.id).emit('file:created', { path: relPath, type });

    res.status(201).json({ message: 'Item created successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create item' });
  }
};

export const deleteItem = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const relPath = req.query.path as string;

    if (!relPath) {
      res.status(400).json({ error: 'Path parameter required' });
      return;
    }

    FileSystemService.deletePath(workspace.storagePath, relPath);

    // Broadcast file deletion
    const fsNamespace = getFsNamespace(req);
    fsNamespace.to(workspace.id).emit('file:deleted', { path: relPath });

    res.status(200).json({ message: 'Item deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to delete item' });
  }
};

export const renameItem = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const { oldPath, newPath } = req.body;

    if (!oldPath || !newPath) {
      res.status(400).json({ error: 'oldPath and newPath are required' });
      return;
    }

    FileSystemService.renamePath(workspace.storagePath, oldPath, newPath);

    // Broadcast file move/rename
    const fsNamespace = getFsNamespace(req);
    fsNamespace.to(workspace.id).emit('file:deleted', { path: oldPath });
    fsNamespace.to(workspace.id).emit('file:created', { path: newPath, type: 'file' }); // Default to generic update

    res.status(200).json({ message: 'Item renamed successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to rename item' });
  }
};

export const uploadFile = async (req: WorkspaceRequest, res: Response): Promise<void> => {
  try {
    const workspace = req.workspace!;
    const file = req.file;
    const targetDir = (req.body.path as string) || '';

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const relPath = targetDir ? `${targetDir}/${file.originalname}` : file.originalname;

    // Write file through existing FileSystemService
    FileSystemService.writeFile(workspace.storagePath, relPath, file.buffer);

    // Broadcast file creation
    const fsNamespace = getFsNamespace(req);
    fsNamespace.to(workspace.id).emit('file:created', { path: relPath, type: 'file' });

    res.status(200).json({ message: 'File uploaded successfully' });
  } catch (error: any) {
    console.error('[Filesystem/Upload] Error:', error);
    res.status(400).json({ error: error.message || 'File upload failed' });
  }
};
