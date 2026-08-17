import React, { useEffect, useState, useRef } from 'react';
import { useFileTreeStore } from '../../shared/stores/useFileTreeStore';
import type { FileNodeInfo } from '../../shared/stores/useFileTreeStore';
import { useEditorStore } from '../../shared/stores/useEditorStore';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { api } from '../../shared/lib/api';
import { getFsSocket } from '../../shared/lib/socket';
import { 
  ChevronRight, 
  ChevronDown, 
  FileCode, 
  Folder, 
  FolderOpen, 
  Plus, 
  Trash2, 
  Edit3, 
  PlusSquare,
  MoreVertical
} from 'lucide-react';

export default function FileExplorer() {
  const { activeWorkspace } = useWorkspaceStore();
  const { filesByFolder, expandedFolders, fetchDirectory, createItem, deleteItem, renameItem, toggleFolder } = useFileTreeStore();
  const { openTab } = useEditorStore();

  const [isDraggingExternal, setIsDraggingExternal] = useState(false);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    type: 'file' | 'folder';
  } | null>(null);

  const [newItemModal, setNewItemModal] = useState<{
    parentPath: string;
    type: 'file' | 'folder';
  } | null>(null);

  const [renameModal, setRenameModal] = useState<{
    path: string;
    currentName: string;
  } | null>(null);

  const [inputName, setInputName] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeWorkspace) {
      // Fetch root directory content
      fetchDirectory(activeWorkspace._id, '');
    }
  }, [activeWorkspace, fetchDirectory]);

  // Synchronize collaborative file tree operations in real-time (Module 51)
  useEffect(() => {
    if (!activeWorkspace) return;
    const socket = getFsSocket();
    if (!socket.connected) {
      socket.connect();
    }

    socket.emit('join', activeWorkspace._id);

    const handleFileCreated = (data: { path: string; type: 'file' | 'folder' }) => {
      const parentPath = data.path.includes('/') ? data.path.substring(0, data.path.lastIndexOf('/')) : '';
      fetchDirectory(activeWorkspace._id, parentPath);
    };

    const handleFileDeleted = (data: { path: string }) => {
      const parentPath = data.path.includes('/') ? data.path.substring(0, data.path.lastIndexOf('/')) : '';
      fetchDirectory(activeWorkspace._id, parentPath);
    };

    socket.on('file:created', handleFileCreated);
    socket.on('file:deleted', handleFileDeleted);

    return () => {
      socket.off('file:created', handleFileCreated);
      socket.off('file:deleted', handleFileDeleted);
    };
  }, [activeWorkspace, fetchDirectory]);

  // Click outside to close context menu
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (contextMenu && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [contextMenu]);

  if (!activeWorkspace) return null;

  const handleContextMenu = (e: React.MouseEvent, path: string, type: 'file' | 'folder') => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      path,
      type,
    });
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemModal || !inputName.trim()) return;

    const parentPath = newItemModal.parentPath;
    const relPath = parentPath ? `${parentPath}/${inputName.trim()}` : inputName.trim();
    
    try {
      await createItem(activeWorkspace._id, relPath, newItemModal.type);
      setNewItemModal(null);
      setInputName('');
      // Re-fetch directory listing to verify
      fetchDirectory(activeWorkspace._id, parentPath);
    } catch (err) {
      alert('Error creating item');
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameModal || !inputName.trim()) return;

    const oldPath = renameModal.path;
    const parentDir = oldPath.includes('/') ? oldPath.substring(0, oldPath.lastIndexOf('/')) : '';
    const newPath = parentDir ? `${parentDir}/${inputName.trim()}` : inputName.trim();

    try {
      await renameItem(activeWorkspace._id, oldPath, newPath);
      setRenameModal(null);
      setInputName('');
      fetchDirectory(activeWorkspace._id, parentDir);
    } catch (err) {
      alert('Error renaming item');
    }
  };

  const handleDeleteItem = async (path: string) => {
    if (!confirm(`Delete ${path} permanently?`)) return;
    const parentDir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';

    try {
      await deleteItem(activeWorkspace._id, path);
      fetchDirectory(activeWorkspace._id, parentDir);
    } catch (err) {
      alert('Error deleting item');
    }
  };

  // Drag and Drop implementation
  const handleDragStart = (e: React.DragEvent, nodePath: string) => {
    e.dataTransfer.setData('text/plain', nodePath);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnterExternal = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingExternal(true);
    }
  };

  const handleDragLeaveExternal = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingExternal(false);
  };

  const handleDrop = async (e: React.DragEvent, targetFolderPath: string) => {
    e.preventDefault();
    setIsDraggingExternal(false);

    // 1. External files upload
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', targetFolderPath);
        
        try {
          await api.post(`/workspaces/${activeWorkspace._id}/files/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        } catch (err) {
          console.error('[FileExplorer/Upload] Error:', err);
          alert(`Failed to upload ${file.name}`);
        }
      }
      fetchDirectory(activeWorkspace._id, targetFolderPath);
      return;
    }

    // 2. Internal move
    const sourcePath = e.dataTransfer.getData('text/plain');
    if (!sourcePath || sourcePath === targetFolderPath) return;

    const fileName = sourcePath.substring(sourcePath.lastIndexOf('/') + 1);
    const newPath = targetFolderPath ? `${targetFolderPath}/${fileName}` : fileName;

    if (sourcePath === newPath) return;

    try {
      await renameItem(activeWorkspace._id, sourcePath, newPath);
      
      const sourceParent = sourcePath.includes('/') ? sourcePath.substring(0, sourcePath.lastIndexOf('/')) : '';
      fetchDirectory(activeWorkspace._id, sourceParent);
      fetchDirectory(activeWorkspace._id, targetFolderPath);
    } catch (err) {
      alert('Error moving item');
    }
  };

  // Recursive Node renderer
  const renderNode = (node: FileNodeInfo, depth: number = 0) => {
    const isExpanded = !!expandedFolders[node.path];
    const children = filesByFolder[node.path] || [];
    const isFolder = node.type === 'folder';

    const handleNodeClick = () => {
      if (isFolder) {
        toggleFolder(node.path);
        if (!expandedFolders[node.path]) {
          fetchDirectory(activeWorkspace._id, node.path);
        }
      } else {
        openTab(activeWorkspace._id, node.path);
      }
    };

    return (
      <div key={node.path} className="select-none">
        <div 
          onClick={handleNodeClick}
          onContextMenu={(e) => handleContextMenu(e, node.path, node.type)}
          draggable
          onDragStart={(e) => handleDragStart(e, node.path)}
          onDragOver={isFolder ? handleDragOver : undefined}
          onDrop={isFolder ? (e) => handleDrop(e, node.path) : undefined}
          style={{ paddingLeft: `${depth * 12 + 6}px` }}
          className="flex items-center justify-between py-1 hover:bg-[#2d2d2d] rounded cursor-pointer text-xs text-gray-300 hover:text-white transition-colors group"
        >
          <div className="flex items-center space-x-1.5 min-w-0">
            {isFolder ? (
              <>
                {isExpanded ? <ChevronDown size={14} className="text-gray-500 flex-shrink-0" /> : <ChevronRight size={14} className="text-gray-500 flex-shrink-0" />}
                {isExpanded ? <FolderOpen size={14} className="text-blue-400 flex-shrink-0" /> : <Folder size={14} className="text-blue-400 flex-shrink-0" />}
              </>
            ) : (
              <>
                <span className="w-3.5 flex-shrink-0"></span>
                <FileCode size={14} className="text-gray-400 flex-shrink-0" />
              </>
            )}
            <span className="truncate">{node.name}</span>
          </div>

          {/* Action dots */}
          <button 
            onClick={(e) => { e.stopPropagation(); handleContextMenu(e, node.path, node.type); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#3c3c3c] rounded text-gray-500 hover:text-white mr-1"
          >
            <MoreVertical size={11} />
          </button>
        </div>

        {isFolder && isExpanded && (
          <div className="mt-0.5">
            {children.map((child) => renderNode(child, depth + 1))}
            {children.length === 0 && (
              <div 
                style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
                className="text-[10px] text-gray-600 py-0.5 italic"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, node.path)}
              >
                Empty folder
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const rootItems = filesByFolder[''] || [];

  return (
    <div 
      className={`h-full flex flex-col p-1 relative transition-colors ${
        isDraggingExternal ? 'bg-blue-600/10 border-2 border-dashed border-blue-500 rounded-lg' : ''
      }`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnterExternal}
      onDragLeave={handleDragLeaveExternal}
      onDrop={(e) => handleDrop(e, '')}
    >
      {isDraggingExternal && (
        <div className="absolute inset-0 bg-blue-600/5 flex flex-col justify-center items-center pointer-events-none text-blue-400 z-30">
          <p className="text-[11px] font-bold">Drop files to upload</p>
        </div>
      )}
      <div className="flex justify-between items-center px-2 py-1 mb-2">
        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">{activeWorkspace.name}</span>
        <div className="flex space-x-1">
          <button 
            onClick={() => setNewItemModal({ parentPath: '', type: 'file' })}
            className="p-1 hover:bg-[#2d2d2d] rounded text-gray-400 hover:text-white"
            title="New File"
          >
            <PlusSquare size={13} />
          </button>
          <button 
            onClick={() => setNewItemModal({ parentPath: '', type: 'folder' })}
            className="p-1 hover:bg-[#2d2d2d] rounded text-gray-400 hover:text-white"
            title="New Folder"
          >
            <Folder size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-0.5">
        {rootItems.map((item) => renderNode(item, 0))}
      </div>

      {/* Context Menu Popup */}
      {contextMenu && (
        <div 
          ref={menuRef}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 bg-[#1c1c1f] border border-[#2d2d30] rounded-lg p-1.5 shadow-2xl w-40 text-xs text-gray-300"
        >
          {contextMenu.type === 'folder' && (
            <>
              <button 
                onClick={() => { setNewItemModal({ parentPath: contextMenu.path, type: 'file' }); setContextMenu(null); }}
                className="w-full text-left px-2 py-1.5 hover:bg-[#2d2d2d] rounded flex items-center space-x-2"
              >
                <Plus size={12} />
                <span>New File</span>
              </button>
              <button 
                onClick={() => { setNewItemModal({ parentPath: contextMenu.path, type: 'folder' }); setContextMenu(null); }}
                className="w-full text-left px-2 py-1.5 hover:bg-[#2d2d2d] rounded flex items-center space-x-2"
              >
                <Folder size={12} />
                <span>New Folder</span>
              </button>
              <div className="h-[1px] bg-[#2d2d30] my-1" />
            </>
          )}
          <button 
            onClick={() => { setRenameModal({ path: contextMenu.path, currentName: contextMenu.path.substring(contextMenu.path.lastIndexOf('/') + 1) }); setContextMenu(null); }}
            className="w-full text-left px-2 py-1.5 hover:bg-[#2d2d2d] rounded flex items-center space-x-2"
          >
            <Edit3 size={12} />
            <span>Rename</span>
          </button>
          <button 
            onClick={() => { handleDeleteItem(contextMenu.path); setContextMenu(null); }}
            className="w-full text-left px-2 py-1.5 hover:bg-red-500/10 hover:text-red-400 rounded flex items-center space-x-2"
          >
            <Trash2 size={12} />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Create Item Modal Overlay */}
      {newItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-[#1c1c1f] border border-[#2d2d30] rounded-xl shadow-2xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              Create new {newItemModal.type} {newItemModal.parentPath && `in /${newItemModal.parentPath}`}
            </h3>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <input 
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder={newItemModal.type === 'file' ? 'index.js' : 'src'}
                className="w-full bg-[#141416] border border-[#2d2d30] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                required
                autoFocus
              />
              <div className="flex justify-end space-x-2">
                <button 
                  type="button" 
                  onClick={() => { setNewItemModal(null); setInputName(''); }}
                  className="px-3 py-1.5 rounded-lg border border-[#2d2d30] text-[10px] hover:bg-[#2d2d2d]"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] font-semibold text-white"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Item Modal Overlay */}
      {renameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-[#1c1c1f] border border-[#2d2d30] rounded-xl shadow-2xl p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
              Rename "{renameModal.currentName}"
            </h3>
            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <input 
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder={renameModal.currentName}
                className="w-full bg-[#141416] border border-[#2d2d30] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                required
                autoFocus
              />
              <div className="flex justify-end space-x-2">
                <button 
                  type="button" 
                  onClick={() => { setRenameModal(null); setInputName(''); }}
                  className="px-3 py-1.5 rounded-lg border border-[#2d2d30] text-[10px] hover:bg-[#2d2d2d]"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] font-semibold text-white"
                >
                  Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
