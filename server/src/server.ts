process.on('uncaughtException', (err) => {
  console.error('[Unhandled Exception] Caught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] Promise:', promise, 'Reason:', reason);
});

import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { config } from './config';
import { connectDB } from './config/database';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/users.routes';
import workspaceRoutes from './modules/workspaces/workspace.routes';
import filesystemRoutes from './modules/filesystem/filesystem.routes';
import { socketAuthMiddleware } from './middleware/auth.middleware';
import { WorkspaceRunnerService } from './modules/workspaces/workspace-runner.service';
import { Workspace } from './modules/workspaces/workspace.model';
import { User } from './modules/users/user.model';
import { GlobalSearchService } from './modules/search/search.service';
import { TerminalService, setIoInstance } from './modules/terminal/terminal.service';
import envRoutes from './modules/env/env.routes';
import runConfigRoutes from './modules/runconfig/runconfig.routes';
import processRoutes from './modules/process/process.routes';
import portForwardRoutes from './modules/port-forwarding/port-forwarding.routes';
import inviteRoutes from './modules/invites/invite.routes';
import gitRoutes from './modules/git/git.routes';
import { PresenceService } from './modules/collaboration/presence.service';
import debugRoutes from './modules/debug/debug.routes';
import { DebugAdapterService, setIoInstance as setDebugIoInstance } from './modules/debug/debug-adapter.service';
import { SyncManager } from './modules/collaboration/sync.manager';
import * as Y from 'yjs';
import extensionRoutes from './modules/extensions/extension.routes';
import { ExtensionHostService } from './modules/extensions/extension-host.service';
import executionRoutes from './modules/execution/execution.routes';
import aiRoutes from './modules/ai/ai.routes';
import { runOrganizationMigration } from './modules/workspaces/org-migration';
import organizationRoutes from './modules/workspaces/organization.routes';
import { LSPService } from './modules/extensions/lsp.service';
import terminalAiRoutes from './modules/terminal/terminal-ai.routes';
import dockerRoutes from './modules/docker/docker.routes';

const app = express();
const server = http.createServer(app);

// CORS configuration
const clientOrigin = config.CLIENT_ORIGIN;
app.use(cors({
  origin: clientOrigin,
  credentials: true,
}));

// Global Request Logger
app.use((req, res, next) => {
  console.log(`[HTTP Request] ${req.method} ${req.originalUrl || req.url}`);
  next();
});

// Parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// REST Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/workspaces/:workspaceId/files', filesystemRoutes);
app.use('/api/workspaces', envRoutes);
app.use('/api/workspaces', runConfigRoutes);
app.use('/api/workspaces', processRoutes);
app.use('/api/workspaces', portForwardRoutes);
app.use('/api', inviteRoutes);
app.use('/api/workspaces', gitRoutes);
app.use('/api/workspaces', debugRoutes);
app.use('/api/extensions', extensionRoutes);
app.use('/api/workspaces/:workspaceId/execution', executionRoutes);
app.use('/api/workspaces/:workspaceId/ai', aiRoutes);
app.use('/api/workspaces/:workspaceId/terminal-ai', terminalAiRoutes);
app.use('/api/workspaces/:workspaceId/docker', dockerRoutes);
app.use('/api', organizationRoutes);

// Health Check API
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  const dbStatus = states[dbState] || 'unknown';

  res.status(dbState === 1 ? 200 : 503).json({
    status: dbState === 1 ? 'OK' : 'DEGRADED',
    timestamp: new Date(),
    database: dbStatus,
  });
});

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: clientOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// Store io instance in express app for access in controllers
app.set('io', io);
setIoInstance(io);
setDebugIoInstance(io);

// Namespaced sockets
const fsNamespace = io.of('/ws/filesystem');
const terminalNamespace = io.of('/ws/terminal');
const aiNamespace = io.of('/ws/ai');
const collabNamespace = io.of('/ws/collaboration');
const debugNamespace = io.of('/ws/debug');
const extensionsNamespace = io.of('/ws/extensions');
const lspNamespace = io.of('/ws/lsp');
SyncManager.setCollabNamespace(collabNamespace);
ExtensionHostService.setIoInstance(extensionsNamespace);
LSPService.setIoInstance(lspNamespace);

// Attach socket authentication middleware
fsNamespace.use(socketAuthMiddleware);
terminalNamespace.use(socketAuthMiddleware);
aiNamespace.use(socketAuthMiddleware);
collabNamespace.use(socketAuthMiddleware);
debugNamespace.use(socketAuthMiddleware);
extensionsNamespace.use(socketAuthMiddleware);
lspNamespace.use(socketAuthMiddleware);

// Active workspace recursive filesystem watchers
const activeWorkspaceWatchers = new Map<string, { watcher: fs.FSWatcher; refCount: number }>();

// Basic room connection logging
fsNamespace.on('connection', (socket) => {
  console.log(`[Socket/FS] Client connected: ${socket.id}`);
  let currentWorkspaceId: string | null = null;
  
  socket.on('join', async (workspaceId: string) => {
    socket.join(workspaceId);
    currentWorkspaceId = workspaceId;
    console.log(`[Socket/FS] Client ${socket.id} joined workspace room: ${workspaceId}`);

    // Manage active FS watcher
    try {
      const workspace = await Workspace.findById(workspaceId);
      if (workspace && fs.existsSync(workspace.storagePath)) {
        const storagePath = workspace.storagePath;
        const existing = activeWorkspaceWatchers.get(workspaceId);
        
        if (existing) {
          existing.refCount++;
        } else {
          console.log(`[FS/Watcher] Starting recursive directory watcher for workspace: ${workspaceId} at ${storagePath}`);
          
          // Use native recursive fs.watch on Windows/macOS
          const watcher = fs.watch(storagePath, { recursive: true }, (eventType, filename) => {
            if (!filename) return;
            const relPath = filename.replace(/\\/g, '/');
            const fullPath = path.join(storagePath, filename);

            // Determine if created/modified or deleted
            if (fs.existsSync(fullPath)) {
              let type: 'file' | 'folder' = 'file';
              try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) type = 'folder';
              } catch {}
              fsNamespace.to(workspaceId).emit('file:created', { path: relPath, type });
            } else {
              fsNamespace.to(workspaceId).emit('file:deleted', { path: relPath });
            }
          });

          activeWorkspaceWatchers.set(workspaceId, { watcher, refCount: 1 });
        }
      }
    } catch (err: any) {
      console.error(`[FS/Watcher] Failed to initialize watcher for workspace ${workspaceId}:`, err.message);
    }
  });

  socket.on('search', async (data: {
    workspaceId: string;
    query: string;
    caseSensitive: boolean;
    isRegex: boolean;
    wholeWord: boolean;
    includes?: string[];
    excludes?: string[];
  }) => {
    try {
      const workspace = await Workspace.findById(data.workspaceId);
      if (!workspace) {
        socket.emit('search:error', { error: 'Workspace not found' });
        return;
      }

      socket.emit('search:start');

      await GlobalSearchService.search(
        workspace.storagePath,
        data.query,
        {
          caseSensitive: data.caseSensitive,
          isRegex: data.isRegex,
          wholeWord: data.wholeWord,
          includes: data.includes,
          excludes: data.excludes,
        },
        (match) => {
          socket.emit('search:match', match);
        }
      );

      socket.emit('search:end');
    } catch (err: any) {
      console.error('[Socket/FS/Search] Error:', err);
      socket.emit('search:error', { error: err.message || 'Search execution failed' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket/FS] Client disconnected: ${socket.id}`);
    
    if (currentWorkspaceId) {
      const existing = activeWorkspaceWatchers.get(currentWorkspaceId);
      if (existing) {
        existing.refCount--;
        if (existing.refCount <= 0) {
          console.log(`[FS/Watcher] Closing directory watcher for workspace: ${currentWorkspaceId}`);
          try {
            existing.watcher.close();
          } catch {}
          activeWorkspaceWatchers.delete(currentWorkspaceId);
        }
      }
    }
  });
});

terminalNamespace.on('connection', (socket) => {
  console.log(`[Socket/Terminal] Client connected: ${socket.id}`);
  
  socket.on('join', (workspaceId: string) => {
    socket.join(workspaceId);
    console.log(`[Socket/Terminal] Client ${socket.id} joined workspace room: ${workspaceId}`);
  });

  socket.on('create-session', async (data: {
    workspaceId: string;
    sessionId: string;
    cols?: number;
    rows?: number;
    customCommand?: string;
  }) => {
    try {
      const userId = socket.data.user?.userId;
      if (!userId) {
        socket.emit('session-error', { sessionId: data.sessionId, error: 'Authentication required' });
        return;
      }

      // Check role permission access
      const workspace = await Workspace.findById(data.workspaceId);
      if (!workspace) {
        socket.emit('session-error', { sessionId: data.sessionId, error: 'Workspace not found' });
        return;
      }

      const isOwner = workspace.ownerId.toString() === userId;
      const collab = workspace.collaborators.find((c) => c.userId.toString() === userId);
      const isEditor = isOwner || (collab && (collab.role === 'editor' || collab.role === 'admin'));

      if (!isEditor) {
        socket.emit('session-error', {
          sessionId: data.sessionId,
          error: 'Insufficient permissions. Code execution requires Editor access.',
        });
        return;
      }

      // Join socket room specific to this PTY session ID
      await socket.join(`session:${data.sessionId}`);

      // Retrieve or spawn terminal PTY
      let session = TerminalService.getSession(data.sessionId);
      if (!session) {
        session = await TerminalService.createSession(
          data.workspaceId,
          data.sessionId,
          data.cols || 80,
          data.rows || 24,
          data.customCommand
        );
      } else {
        // Replay cached scrollback buffer for transient reconnects
        for (const chunk of session.scrollbackBuffer) {
          socket.emit('output', { sessionId: data.sessionId, data: chunk });
        }
      }
    } catch (err: any) {
      console.error('[Socket/Terminal/CreateSession] Error:', err);
      socket.emit('session-error', { sessionId: data.sessionId, error: err.message });
    }
  });

  socket.on('input', (data: { sessionId: string; data: string }) => {
    const session = TerminalService.getSession(data.sessionId);
    if (session) {
      session.pty.write(data.data);
    }
  });

  socket.on('resize', (data: { sessionId: string; cols: number; rows: number }) => {
    const session = TerminalService.getSession(data.sessionId);
    if (session && data.cols && data.rows) {
      try {
        session.pty.resize(data.cols, data.rows);
      } catch (err) {
        // Safe check
      }
    }
  });

  socket.on('close-session', (data: { sessionId: string }) => {
    TerminalService.closeSession(data.sessionId);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket/Terminal] Client disconnected: ${socket.id}`);
  });
});

aiNamespace.on('connection', (socket) => {
  console.log(`[Socket/AI] Client connected: ${socket.id}`);
  
  socket.on('join', (workspaceId: string) => {
    socket.join(workspaceId);
    console.log(`[Socket/AI] Client ${socket.id} joined workspace room: ${workspaceId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket/AI] Client disconnected: ${socket.id}`);
  });
});

collabNamespace.on('connection', (socket) => {
  console.log(`[Socket/Collab] Client connected: ${socket.id}`);
  
  socket.on('join', (workspaceId: string) => {
    socket.join(workspaceId);
    console.log(`[Socket/Collab] Client ${socket.id} joined workspace room: ${workspaceId}`);
  });

  socket.on('presence:join', async (data: { workspaceId: string }) => {
    const user = socket.data.user;
    if (user && data.workspaceId) {
      try {
        const dbUser = await User.findById(user.userId);
        const userWithName = {
          ...user,
          name: dbUser ? dbUser.name : 'Unknown User',
        };
        PresenceService.joinWorkspace(socket, data.workspaceId, userWithName);
      } catch (err) {
        console.error('[Socket/Collab/Presence] Error fetching user for presence:', err);
        PresenceService.joinWorkspace(socket, data.workspaceId, { ...user, name: 'Unknown User' });
      }
    }
  });

  // 1. Join Document Sync session
  socket.on('sync:join', async (data: { workspaceId: string; filePath: string }) => {
    try {
      const roomName = `file-sync:${data.workspaceId}:${data.filePath}`;
      socket.join(roomName);

      if (!socket.data.joinedFiles) {
        socket.data.joinedFiles = new Set<string>();
      }
      socket.data.joinedFiles.add(`${data.workspaceId}:${data.filePath}`);

      SyncManager.addListener(data.workspaceId, data.filePath, socket.id);
      console.log(`[Socket/Sync] Client ${socket.id} joined file sync: ${data.filePath}`);
    } catch (err: any) {
      console.error('[Socket/Sync/Join] Error:', err);
    }
  });

  // 2. Yjs Sync Protocol - step 1 (Receive client state vector and reply with updates)
  socket.on('yjs:sync-step-1', async (data: { workspaceId: string; filePath: string; stateVector: string }) => {
    try {
      const doc = await SyncManager.getOrCreateDoc(data.workspaceId, data.filePath);
      
      const clientVector = Buffer.from(data.stateVector, 'base64');
      const update = Y.encodeStateAsUpdate(doc, clientVector);
      
      socket.emit('yjs:sync-step-2', {
        filePath: data.filePath,
        update: Buffer.from(update).toString('base64'),
      });

      const serverVector = Y.encodeStateVector(doc);
      socket.emit('yjs:sync-step-1', {
        filePath: data.filePath,
        stateVector: Buffer.from(serverVector).toString('base64'),
      });
    } catch (err: any) {
      console.error('[Socket/Sync/Step1] Error:', err.message);
    }
  });

  // 3. Yjs Sync Protocol - step 2 (Receive missing updates from client and apply)
  socket.on('yjs:update', async (data: { workspaceId: string; filePath: string; update: string }) => {
    try {
      const doc = await SyncManager.getOrCreateDoc(data.workspaceId, data.filePath);
      const updateBuffer = Buffer.from(data.update, 'base64');
      
      Y.applyUpdate(doc, updateBuffer);
      
      const roomName = `file-sync:${data.workspaceId}:${data.filePath}`;
      socket.to(roomName).emit('yjs:update', {
        filePath: data.filePath,
        update: data.update,
      });

      SyncManager.queueSave(data.workspaceId, data.filePath);
    } catch (err: any) {
      console.error('[Socket/Sync/Update] Error:', err.message);
    }
  });

  // 4. Live Cursors and Selection Relays (Module 48)
  socket.on('cursor:move', (data: {
    workspaceId: string;
    filePath: string;
    position: { lineNumber: number; column: number } | null;
    selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null;
  }) => {
    const user = socket.data.user;
    if (!user) return;

    const presence = PresenceService.getPresentUsers(data.workspaceId);
    const member = presence.find((u) => u.userId === user.userId);
    const color = member ? member.color : '#3b82f6';

    const roomName = `file-sync:${data.workspaceId}:${data.filePath}`;
    socket.to(roomName).emit('cursor:update', {
      userId: user.userId,
      name: user.name,
      color,
      filePath: data.filePath,
      position: data.position,
      selection: data.selection,
    });
  });

  // 5. Leave Document Sync session
  socket.on('sync:leave', async (data: { workspaceId: string; filePath: string }) => {
    try {
      const roomName = `file-sync:${data.workspaceId}:${data.filePath}`;
      socket.leave(roomName);

      if (socket.data.joinedFiles) {
        socket.data.joinedFiles.delete(`${data.workspaceId}:${data.filePath}`);
      }

      await SyncManager.removeListener(data.workspaceId, data.filePath, socket.id);
    } catch (err: any) {
      console.error('[Socket/Sync/Leave] Error:', err);
    }
  });

  socket.on('disconnect', async () => {
    PresenceService.leaveAll(socket);

    if (socket.data.joinedFiles) {
      for (const fileKey of socket.data.joinedFiles) {
        const [workspaceId, filePath] = fileKey.split(':');
        await SyncManager.removeListener(workspaceId, filePath, socket.id);
      }
    }
    console.log(`[Socket/Collab] Client disconnected: ${socket.id}`);
  });
});

debugNamespace.on('connection', (socket) => {
  console.log(`[Socket/Debug] Client connected: ${socket.id}`);

  socket.on('join', (data: { sessionId: string }) => {
    socket.join(`debug:${data.sessionId}`);
    console.log(`[Socket/Debug] Socket ${socket.id} joined debug session: ${data.sessionId}`);
  });

  socket.on('start-session', async (data: {
    workspaceId: string;
    sessionId: string;
    adapterType: 'node' | 'python';
  }) => {
    try {
      const userId = socket.data.user?.userId;
      if (!userId) {
        socket.emit('session-error', { sessionId: data.sessionId, error: 'Authentication required' });
        return;
      }

      // Check role permissions (Module 88)
      const workspace = await Workspace.findById(data.workspaceId);
      if (!workspace) {
        socket.emit('session-error', { sessionId: data.sessionId, error: 'Workspace not found' });
        return;
      }

      const isOwner = workspace.ownerId.toString() === userId;
      const collab = workspace.collaborators.find((c) => c.userId.toString() === userId);
      const isEditor = isOwner || (collab && (collab.role === 'editor' || collab.role === 'admin'));

      if (!isEditor) {
        socket.emit('session-error', {
          sessionId: data.sessionId,
          error: 'Insufficient permissions. Debugging requires Editor access.',
        });
        return;
      }

      // Join room
      socket.join(`debug:${data.sessionId}`);

      // Spawn debug adapter process inside container sandbox
      await DebugAdapterService.createSession(data.workspaceId, data.sessionId, data.adapterType, userId);
      console.log(`[Socket/Debug] Debug adapter spawned successfully for session ${data.sessionId}`);
    } catch (err: any) {
      console.error('[Socket/Debug/StartSession] Error:', err);
      socket.emit('session-error', { sessionId: data.sessionId, error: err.message });
    }
  });

  socket.on('dap:request', (data: { sessionId: string; message: any }) => {
    const session = DebugAdapterService.getSession(data.sessionId);
    if (!session) {
      socket.emit('session-error', { sessionId: data.sessionId, error: 'Active debug session not found' });
      return;
    }

    // Role check for evaluate requests (Module 88)
    const userId = socket.data.user?.userId;
    if (session.userId !== userId) {
      if (!userId) {
        socket.emit('session-error', { sessionId: data.sessionId, error: 'Authentication required' });
        return;
      }
    }

    // Rate limit evaluate requests (Module 88)
    if (data.message && data.message.command === 'evaluate') {
      const now = Date.now();
      if (!socket.data.evaluateTimestamps) {
        socket.data.evaluateTimestamps = [];
      }
      socket.data.evaluateTimestamps = socket.data.evaluateTimestamps.filter((t: number) => now - t < 5000);
      if (socket.data.evaluateTimestamps.length >= 20) {
        socket.emit('dap:error', { sessionId: data.sessionId, error: 'Rate limit exceeded: too many evaluate requests' });
        return;
      }
      socket.data.evaluateTimestamps.push(now);
    }

    if (session.adapterProcess.stdin) {
      const json = JSON.stringify(data.message);
      session.adapterProcess.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
    }
  });

  socket.on('close-session', (data: { sessionId: string }) => {
    DebugAdapterService.closeSession(data.sessionId);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket/Debug] Client disconnected: ${socket.id}`);
  });
});

extensionsNamespace.on('connection', (socket) => {
  console.log(`[Socket/Extensions] Client connected: ${socket.id}`);
  
  socket.on('join', (workspaceId: string) => {
    socket.join(workspaceId);
    console.log(`[Socket/Extensions] Client joined workspace room: ${workspaceId}`);
  });

  socket.on('extension:execute-command', async (data: { extensionId: string; commandId: string; args?: any[] }, callback?: any) => {
    try {
      const result = await ExtensionHostService.executeCommand(data.extensionId, data.commandId, data.args || []);
      if (callback) callback({ success: true, result });
    } catch (err: any) {
      if (callback) callback({ success: false, error: err.message || 'Execution failed' });
    }
  });
});

lspNamespace.on('connection', (socket) => {
  console.log(`[Socket/LSP] Client connected: ${socket.id}`);

  socket.on('lsp:start-session', async (data: {
    workspaceId: string;
    sessionId: string;
    languageId: string;
  }) => {
    try {
      await LSPService.startSession(data.workspaceId, data.sessionId, data.languageId, socket);
    } catch (err: any) {
      console.error('[Socket/LSP] Failed to start LSP session:', err);
      socket.emit('lsp:error', { sessionId: data.sessionId, error: err.message || 'Failed to start LSP session' });
    }
  });

  socket.on('lsp:message', (data: { sessionId: string; message: string }) => {
    LSPService.handleMessage(data.sessionId, data.message);
  });

  socket.on('lsp:close-session', (data: { sessionId: string }) => {
    LSPService.closeSession(data.sessionId);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket/LSP] Client disconnected: ${socket.id}`);
  });
});

// Start Server after DB Connection
const PORT = config.PORT;

const startServer = async () => {
  await connectDB();
  await runOrganizationMigration();
  
  // Initialize sandboxed workspace runner settings
  await WorkspaceRunnerService.checkDockerAvailability();
  WorkspaceRunnerService.startReaper();
  
  server.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(`[Server] Cloud IDE Server is running on PORT: ${PORT}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/health`);
    console.log(`=============================================`);
  });
};

startServer();
// Dummy comment for hot reload verification

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

