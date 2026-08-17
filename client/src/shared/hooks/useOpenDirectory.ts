import { useState } from 'react';

export interface LocalFileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: LocalFileNode[];
}

export function useOpenDirectory() {
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [workspaceName, setWorkspaceName] = useState<string>('');
  const [folderTree, setFolderTree] = useState<LocalFileNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const openDirectory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Open browser native folder picker (File System Access API)
      if (!(window as any).showDirectoryPicker) {
        throw new Error('Your browser does not support the File System Access API. Please enter the path manually.');
      }

      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });

      setSelectedFolder(dirHandle.name);
      setWorkspaceName(dirHandle.name);

      // 2. Traverse directory recursively to build tree
      const traverse = async (handle: FileSystemDirectoryHandle, currentPath: string): Promise<LocalFileNode[]> => {
        const nodes: LocalFileNode[] = [];
        for await (const entry of (handle as any).values()) {
          const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          if (entry.kind === 'directory') {
            const children = await traverse(entry, relativePath);
            nodes.push({
              name: entry.name,
              path: relativePath,
              type: 'folder',
              children
            });
          } else {
            nodes.push({
              name: entry.name,
              path: relativePath,
              type: 'file'
            });
          }
        }
        return nodes.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      };

      const tree = await traverse(dirHandle, '');
      setFolderTree(tree);
      return { name: dirHandle.name, tree };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled, do nothing
        return null;
      }
      console.error('[useOpenDirectory] Error:', err);
      setError(err.message || 'Permission denied or failed to read directory.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    openDirectory,
    selectedFolder,
    workspaceName,
    folderTree,
    isLoading,
    error
  };
}
