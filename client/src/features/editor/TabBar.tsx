import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../shared/stores/useEditorStore';
import { useLayoutStore } from '../../shared/stores/useLayoutStore';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { api } from '../../shared/lib/api';
import { useTerminalStore } from '../../shared/stores/useTerminalStore';
import { 
  X, 
  FileCode, 
  ChevronDown, 
  AlertTriangle,
  Play
} from 'lucide-react';

interface TabBarProps {
  paneId: string;
  openTabs: string[];
  activeTab: string | null;
}

export default function TabBar({ paneId, openTabs, activeTab }: TabBarProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const { openTabs: globalTabs, saveTab } = useEditorStore();
  const { 
    setActiveTab, 
    closeTab: closePaneTab, 
    reorderTabs, 
    moveTab 
  } = useLayoutStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabPath: string;
  } | null>(null);

  const [confirmCloseTab, setConfirmCloseTab] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleRunActiveFile = () => {
    if ((window as any).handleRunActiveFile) {
      (window as any).handleRunActiveFile();
    }
  };

  // Close context menu & dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (contextMenu && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [contextMenu, dropdownOpen]);

  if (!activeWorkspace) return null;

  const getFileIcon = (filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return <FileCode size={13} className="text-blue-400 flex-shrink-0" />;
      case 'js':
      case 'jsx':
        return <FileCode size={13} className="text-yellow-400 flex-shrink-0" />;
      case 'py':
        return <FileCode size={13} className="text-green-400 flex-shrink-0" />;
      case 'json':
        return <FileCode size={13} className="text-yellow-500 flex-shrink-0" />;
      case 'md':
        return <FileCode size={13} className="text-orange-400 flex-shrink-0" />;
      default:
        return <FileCode size={13} className="text-gray-400 flex-shrink-0" />;
    }
  };

  const handleTabCloseClick = (e: React.MouseEvent, tabPath: string) => {
    e.stopPropagation();
    const globalTab = globalTabs.find(t => t.path === tabPath);
    
    if (globalTab?.isDirty) {
      setConfirmCloseTab(tabPath);
    } else {
      closePaneTab(paneId, tabPath);
      // If file is not open in any other pane, we can optionally close it globally
      // (Bypassed for simple caching)
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tabPath: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tabPath,
    });
  };

  // Drag and Drop Tab Reordering & Moving
  const handleDragStart = (e: React.DragEvent, index: number, path: string) => {
    setDraggedIndex(index);
    e.dataTransfer.setData('text/tab-path', path);
    e.dataTransfer.setData('text/source-pane', paneId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const path = e.dataTransfer.getData('text/tab-path');
    const sourcePane = e.dataTransfer.getData('text/source-pane');

    if (sourcePane && sourcePane !== paneId) {
      // Dragged from another pane
      moveTab(path, sourcePane, paneId, index);
    } else if (draggedIndex !== null && draggedIndex !== index) {
      // Reordered within this pane
      reorderTabs(paneId, draggedIndex, index);
    }
    setDraggedIndex(null);
  };

  const handleConfirmCloseSave = async () => {
    if (confirmCloseTab) {
      await saveTab(activeWorkspace._id, confirmCloseTab);
      closePaneTab(paneId, confirmCloseTab);
      setConfirmCloseTab(null);
    }
  };

  const handleConfirmCloseDiscard = () => {
    if (confirmCloseTab) {
      closePaneTab(paneId, confirmCloseTab);
      setConfirmCloseTab(null);
    }
  };

  return (
    <div className="flex items-center justify-between h-9 bg-[#2d2d2d] border-b border-[#3c3c3c] select-none relative w-full">
      {/* Scrollable Tab Container */}
      <div 
        className="flex-1 flex overflow-x-auto scrollbar-none h-full divide-x divide-[#3c3c3c]"
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, openTabs.length)}
      >
        {openTabs.map((path, index) => {
          const isActive = activeTab === path;
          const globalTab = globalTabs.find(t => t.path === path);
          const fileName = path.substring(path.lastIndexOf('/') + 1);

          return (
            <div
              key={path}
              onClick={() => setActiveTab(paneId, path)}
              onContextMenu={(e) => handleContextMenu(e, path)}
              draggable
              onDragStart={(e) => handleDragStart(e, index, path)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              className={`flex items-center space-x-2 px-3 h-full cursor-pointer text-xs transition-colors group relative border-t-2 ${
                isActive 
                  ? 'bg-[#1e1e1e] text-white border-t-blue-500 font-medium' 
                  : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#252526] hover:text-gray-200 border-t-transparent'
              }`}
            >
              {getFileIcon(path)}
              <span className="truncate max-w-[120px]">{fileName}</span>
              
              {/* Dirty dot or close button */}
              <div className="flex items-center justify-center w-4 h-4 relative">
                {globalTab?.isDirty ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 absolute group-hover:hidden" />
                ) : null}
                
                <button
                  onClick={(e) => handleTabCloseClick(e, path)}
                  className={`p-0.5 hover:bg-[#333333] rounded text-gray-400 hover:text-white transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <X size={10} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Run & Overflow Toolbar */}
      <div className="h-full flex items-center px-2 border-l border-[#3c3c3c] text-gray-400 space-x-1.5">
        {activeTab && (
          <button
            onClick={handleRunActiveFile}
            className="p-1 hover:bg-[#333333] hover:text-green-500 rounded transition-colors flex items-center"
            title="Run File"
          >
            <Play size={13} fill="currentColor" />
          </button>
        )}

        {openTabs.length > 0 ? (
          <div ref={dropdownRef} className="h-full flex items-center">
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="p-1 hover:bg-[#333333] rounded transition-colors"
              title="Open Pane Tabs"
            >
              <ChevronDown size={14} />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-9 z-50 bg-[#1c1c1f] border border-[#2d2d30] rounded-lg shadow-2xl p-1.5 w-56 text-xs text-gray-300">
                <div className="text-[10px] uppercase font-bold text-gray-500 px-2 py-1 border-b border-[#2d2d30] mb-1">
                  Pane Editors
                </div>
                <div className="max-h-60 overflow-y-auto space-y-0.5">
                  {openTabs.map((path) => {
                    const globalTab = globalTabs.find(t => t.path === path);
                    return (
                      <button
                        key={path}
                        onClick={() => { setActiveTab(paneId, path); setDropdownOpen(false); }}
                        className={`w-full text-left px-2 py-1.5 hover:bg-[#2d2d2d] rounded flex items-center justify-between ${
                          activeTab === path ? 'bg-blue-600/20 text-white font-medium' : ''
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          {getFileIcon(path)}
                          <span className="truncate">{path}</span>
                        </div>
                        {globalTab?.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 ml-1"></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Context Menu Popup */}
      {contextMenu && (
        <div 
          ref={menuRef}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 bg-[#1c1c1f] border border-[#2d2d30] rounded-lg p-1.5 shadow-2xl w-40 text-xs text-gray-300"
        >
          <button 
            onClick={() => { closePaneTab(paneId, contextMenu.tabPath); setContextMenu(null); }}
            className="w-full text-left px-2 py-1.5 hover:bg-[#2d2d2d] rounded"
          >
            Close Tab
          </button>
          <button 
            onClick={() => {
              openTabs.forEach(t => {
                if (t !== contextMenu.tabPath) closePaneTab(paneId, t);
              });
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 hover:bg-[#2d2d2d] rounded"
          >
            Close Others
          </button>
          <button 
            onClick={() => {
              openTabs.forEach(t => closePaneTab(paneId, t));
              setContextMenu(null);
            }}
            className="w-full text-left px-2 py-1.5 hover:bg-[#2d2d2d] rounded"
          >
            Close All
          </button>
        </div>
      )}

      {/* Confirmation warning overlay */}
      {confirmCloseTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-[#1c1c1f] border border-[#2d2d30] rounded-xl shadow-2xl p-5">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="text-yellow-500 flex-shrink-0" size={20} />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-200">Unsaved changes</h3>
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                  Do you want to save your changes to "{confirmCloseTab.substring(confirmCloseTab.lastIndexOf('/') + 1)}"?
                </p>
              </div>
            </div>
            <div className="flex justify-end space-x-2 mt-5">
              <button 
                onClick={() => setConfirmCloseTab(null)}
                className="px-3 py-1.5 rounded-lg border border-[#2d2d30] text-[10px] text-gray-300 hover:bg-[#2d2d2d]"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmCloseDiscard}
                className="px-3 py-1.5 rounded-lg border border-red-900/30 bg-red-950/20 text-[10px] text-red-400 hover:bg-red-900/30"
              >
                Don't Save
              </button>
              <button 
                onClick={handleConfirmCloseSave}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[10px] font-semibold text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
