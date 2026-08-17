import React, { useEffect, useState, useRef } from 'react';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { Search, Folder, User as UserIcon, X, Monitor } from 'lucide-react';

export default function CommandPalette() {
  const { workspaces, activeWorkspace, setActiveWorkspace } = useWorkspaceStore();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Bind Cmd+K / Ctrl+K keyboard trigger globally
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Autofocus input when palette opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Compile search list
  const searchItems: { id: string; name: string; type: 'workspace' | 'action' | 'member'; subtitle?: string; action: () => void }[] = [];

  // 1. Add workspaces to search list
  workspaces.forEach((w) => {
    searchItems.push({
      id: `ws-${w._id}`,
      name: w.name,
      type: 'workspace',
      subtitle: `Template: ${w.templateUsed} • Status: ${w.containerStatus}`,
      action: () => {
        setActiveWorkspace(w);
        setIsOpen(false);
      }
    });
  });

  // 2. Add quick actions
  searchItems.push({
    id: 'act-new-terminal',
    name: 'Open New Terminal Tab',
    type: 'action',
    subtitle: 'Allocates a new workspace PTY session',
    action: () => {
      // Triggers terminal creation automatically
      const plusBtn = document.querySelector('button[title="Open new terminal tab"]') as HTMLButtonElement;
      plusBtn?.click();
      setIsOpen(false);
    }
  });

  // 3. Add members of active workspace
  if (activeWorkspace) {
    searchItems.push({
      id: 'act-git-pull',
      name: 'Git Pull',
      type: 'action',
      subtitle: 'Pull latest commits from remote origin',
      action: () => {
        alert('Git pull initiated.');
        setIsOpen(false);
      }
    });
  }

  // Filter items based on fuzzy query match
  const filtered = searchItems.filter(item => 
    item.name.toLowerCase().includes(query.toLowerCase()) ||
    (item.subtitle && item.subtitle.toLowerCase().includes(query.toLowerCase()))
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(filtered.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-start justify-center pt-[15vh]">
      <div 
        className="w-[500px] bg-[#1e1e1f]/90 border border-[#3e3e3f]/60 rounded-lg shadow-2xl flex flex-col overflow-hidden max-h-[400px]"
        onKeyDown={handleKeyDown}
      >
        {/* Input Bar */}
        <div className="flex items-center space-x-3 px-3.5 py-3 border-b border-[#3c3c3c]">
          <Search className="text-gray-400" size={16} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search workspaces, actions, or members... (Esc to close)"
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
          />
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto py-1.5 select-none">
          {filtered.length === 0 ? (
            <div className="text-center text-gray-500 text-xs py-8">No results found matching your query.</div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-start space-x-3 py-2.5 px-4 cursor-pointer text-xs transition-colors ${
                    isSelected ? 'bg-blue-600/90 text-white' : 'hover:bg-[#252526] text-gray-300'
                  }`}
                >
                  <span className="mt-0.5">
                    {item.type === 'workspace' ? (
                      <Folder size={14} className={isSelected ? 'text-white' : 'text-blue-400'} />
                    ) : item.type === 'action' ? (
                      <Monitor size={14} className={isSelected ? 'text-white' : 'text-green-400'} />
                    ) : (
                      <UserIcon size={14} className={isSelected ? 'text-white' : 'text-purple-400'} />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.name}</div>
                    {item.subtitle && (
                      <div className={`text-[10px] truncate ${isSelected ? 'text-blue-200' : 'text-gray-500'}`}>
                        {item.subtitle}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
