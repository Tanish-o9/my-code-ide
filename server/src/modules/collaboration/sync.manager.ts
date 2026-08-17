import * as Y from 'yjs';
import fs from 'fs';
import { FileSystemService } from '../filesystem/filesystem.service';
import { Workspace } from '../workspaces/workspace.model';

const activeDocs = new Map<string, Y.Doc>();
const activeListeners = new Map<string, Set<string>>();
const saveTimeouts = new Map<string, NodeJS.Timeout>();
const activeWatchers = new Map<string, fs.FSWatcher>();

export class SyncManager {
  private static collabNamespace: any | null = null;

  /**
   * Caches Socket.IO collaboration namespace instance to broadcast out-of-band updates.
   */
  public static setCollabNamespace(namespace: any): void {
    this.collabNamespace = namespace;
  }

  /**
   * Checks if a file has an active collaborative session.
   */
  public static isSessionActive(workspaceId: string, filePath: string): boolean {
    const key = `${workspaceId}:${filePath}`;
    return activeDocs.has(key);
  }

  /**
   * Retrieves all active collaborative file paths in a workspace.
   */
  public static getActiveFiles(workspaceId: string): string[] {
    const prefix = `${workspaceId}:`;
    const files: string[] = [];
    for (const key of activeDocs.keys()) {
      if (key.startsWith(prefix)) {
        files.push(key.substring(prefix.length));
      }
    }
    return files;
  }

  /**
   * Retrieves or initializes a Y.Doc in memory from the on-disk file.
   */
  public static async getOrCreateDoc(workspaceId: string, filePath: string): Promise<Y.Doc> {
    const key = `${workspaceId}:${filePath}`;
    let doc = activeDocs.get(key);

    if (!doc) {
      doc = new Y.Doc();
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) throw new Error('Workspace not found');

      let content = '';
      try {
        content = FileSystemService.readFile(workspace.storagePath, filePath);
      } catch (err) {
        // If file doesn't exist yet, start with empty string
      }

      const ytext = doc.getText('monaco');
      ytext.insert(0, content);
      activeDocs.set(key, doc);
      console.log(`[SyncManager] Loaded Y.Doc in memory for file: ${filePath}`);

      // Setup active file disk change watcher (Module 50)
      this.setupFileWatcher(workspaceId, filePath, workspace.storagePath, key);
    }

    return doc;
  }

  /**
   * Sets up a fs watcher for an active collaborative file to sync out-of-band disk updates.
   */
  private static setupFileWatcher(
    workspaceId: string,
    filePath: string,
    workspacePath: string,
    key: string
  ): void {
    try {
      const safePath = FileSystemService.resolveSafePath(workspacePath, filePath);
      if (!fs.existsSync(safePath)) return;

      const watcher = fs.watch(safePath, async (eventType) => {
        const doc = activeDocs.get(key);
        if (!doc) return;

        if (eventType === 'change') {
          // Verify if disk contents differ from memory (deduplicates own writes)
          try {
            const diskText = fs.readFileSync(safePath, 'utf8');
            const memoryText = doc.getText('monaco').toString();
            if (diskText !== memoryText) {
              console.log(`[Watcher] External modification to active file: ${filePath}. Merging to CRDT...`);
              await this.syncFromDisk(workspaceId, filePath);

              const update = Y.encodeStateAsUpdate(doc);
              const roomName = `file-sync:${workspaceId}:${filePath}`;
              if (this.collabNamespace) {
                this.collabNamespace.to(roomName).emit('yjs:update', {
                  filePath,
                  update: Buffer.from(update).toString('base64'),
                });
              }
            }
          } catch (err) {
            // Ignore temporary locks or transient read faults
          }
        } else if (eventType === 'rename') {
          // File has been deleted or moved out of workspace
          if (!fs.existsSync(safePath)) {
            console.log(`[Watcher] Active file deleted: ${filePath}. Tearing down collaboration room.`);
            const roomName = `file-sync:${workspaceId}:${filePath}`;
            if (this.collabNamespace) {
              // Notify editors of room termination
              this.collabNamespace.to(roomName).emit('sync:sever', { filePath });
            }

            // Unload document resources
            watcher.close();
            activeWatchers.delete(key);
            activeDocs.delete(key);
            activeListeners.delete(key);
          }
        }
      });

      activeWatchers.set(key, watcher);
    } catch (err: any) {
      console.error(`[Watcher/Setup] Failed to watch ${filePath}:`, err.message);
    }
  }

  /**
   * Tracks a connection listening to edits for a specific file.
   */
  public static addListener(workspaceId: string, filePath: string, socketId: string): void {
    const key = `${workspaceId}:${filePath}`;
    let listeners = activeListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      activeListeners.set(key, listeners);
    }
    listeners.add(socketId);
  }

  /**
   * Removes a listener, doing a final save if empty.
   */
  public static async removeListener(workspaceId: string, filePath: string, socketId: string): Promise<void> {
    const key = `${workspaceId}:${filePath}`;
    const listeners = activeListeners.get(key);
    if (!listeners) return;

    listeners.delete(socketId);
    if (listeners.size === 0) {
      activeListeners.delete(key);
      
      // Close file watcher
      const watcher = activeWatchers.get(key);
      if (watcher) {
        watcher.close();
        activeWatchers.delete(key);
      }

      // Cancel pending debounced save timeout
      const timeout = saveTimeouts.get(key);
      if (timeout) {
        clearTimeout(timeout);
        saveTimeouts.delete(key);
      }

      // Final save to disk and unload Y.Doc from memory
      await this.saveToDisk(workspaceId, filePath);
      activeDocs.delete(key);
      console.log(`[SyncManager] Unloaded Y.Doc for file: ${filePath} (0 active users)`);
    }
  }

  /**
   * Triggers a debounced auto-save of the memory text to disk.
   */
  public static queueSave(workspaceId: string, filePath: string): void {
    const key = `${workspaceId}:${filePath}`;
    if (saveTimeouts.has(key)) return;

    const timeout = setTimeout(async () => {
      saveTimeouts.delete(key);
      await this.saveToDisk(workspaceId, filePath);
    }, 5000); // 5 seconds debounce

    saveTimeouts.set(key, timeout);
  }

  /**
   * Performs the actual write operation from memory Y.Doc back to disk.
   */
  public static async saveToDisk(workspaceId: string, filePath: string): Promise<void> {
    const key = `${workspaceId}:${filePath}`;
    const doc = activeDocs.get(key);
    if (!doc) return;

    try {
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      const text = doc.getText('monaco').toString();
      FileSystemService.writeFile(workspace.storagePath, filePath, text);
      console.log(`[SyncManager] Saved ${filePath} to disk`);
    } catch (err: any) {
      console.error(`[SyncManager/Save] Failed to save ${filePath}:`, err.message);
    }
  }

  /**
   * Replaces memory Y.Doc text from external disk write (Module 50 reconciliation).
   */
  public static async syncFromDisk(workspaceId: string, filePath: string): Promise<void> {
    const key = `${workspaceId}:${filePath}`;
    const doc = activeDocs.get(key);
    if (!doc) return;

    try {
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      const text = FileSystemService.readFile(workspace.storagePath, filePath);
      const ytext = doc.getText('monaco');
      
      // Update Y.Text contents in a single transaction to maintain CRDT history
      doc.transact(() => {
        const len = ytext.length;
        ytext.delete(0, len);
        ytext.insert(0, text);
      });
      
      console.log(`[SyncManager] Out-of-band disk change merged into memory for file: ${filePath}`);
    } catch (err: any) {
      console.error(`[SyncManager/SyncFromDisk] Failed to sync ${filePath}:`, err.message);
    }
  }
}
