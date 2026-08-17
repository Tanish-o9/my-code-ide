import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { useTerminalStore } from '../../shared/stores/useTerminalStore';
import { api } from '../../shared/lib/api';
import { Package, Plus, Trash2, RefreshCw, AlertCircle, Play } from 'lucide-react';

export default function DependenciesPanel() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspace?._id);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [manifestFile, setManifestFile] = useState<string>('package.json');
  const [ambiguousList, setAmbiguousList] = useState<string[]>([]);
  const [dependencies, setDependencies] = useState<Record<string, string>>({});

  
  // Form input
  const [newPackage, setNewPackage] = useState('');

  // 1. Detect Package Manager & Manifest
  const detectManager = async () => {
    if (!workspaceId) return;
    try {
      const res = await api.get(`/workspaces/${workspaceId}/execution/package/detect`);
      const { detected, ambiguous, manifestsFound } = res.data;
      
      if (detected) {
        setManagerId(detected);
        if (detected === 'cargo') setManifestFile('Cargo.toml');
        else if (detected === 'pip') setManifestFile('requirements.txt');
        else setManifestFile('package.json');
      } else if (ambiguous.length > 0) {
        setAmbiguousList(ambiguous);
        setManagerId(null);
      } else {
        // Fallback default
        setManagerId('npm');
        setManifestFile('package.json');
      }

      await loadDependencies(manifestsFound.includes('Cargo.toml') ? 'Cargo.toml' : (manifestsFound.includes('requirements.txt') ? 'requirements.txt' : 'package.json'));
    } catch (err: any) {
      console.error('Failed to detect package settings:', err);
    }
  };

  // 2. Load and parse Dependencies from File Content
  const loadDependencies = async (targetFile: string) => {
    if (!workspaceId) return;
    try {
      const res = await api.get(`/workspaces/${workspaceId}/files/content`, {
        params: { filePath: targetFile }
      });
      const content = res.data;

      if (targetFile === 'package.json') {
        const parsed = JSON.parse(content || '{}');
        const deps = {
          ...(parsed.dependencies || {}),
          ...(parsed.devDependencies || {})
        };
        setDependencies(deps);
      } else if (targetFile === 'requirements.txt') {
        // Parse simple pip requirements.txt lines
        const lines = content.split('\n');
        const deps: Record<string, string> = {};
        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine && !cleanLine.startsWith('#')) {
            const parts = cleanLine.split('==');
            deps[parts[0]] = parts[1] || 'latest';
          }
        }
        setDependencies(deps);
      } else if (targetFile === 'Cargo.toml') {
        // Parse simple Cargo dependencies block
        const lines = content.split('\n');
        const deps: Record<string, string> = {};
        let inDepsBlock = false;
        for (const line of lines) {
          const cleanLine = line.trim();
          if (cleanLine === '[dependencies]') {
            inDepsBlock = true;
            continue;
          }
          if (cleanLine.startsWith('[') && cleanLine !== '[dependencies]') {
            inDepsBlock = false;
          }
          if (inDepsBlock && cleanLine) {
            const parts = cleanLine.split('=');
            if (parts.length >= 2) {
              deps[parts[0].trim()] = parts[1].replace(/"/g, '').trim();
            }
          }
        }
        setDependencies(deps);
      }
    } catch (err) {
      // Manifest might not exist yet
      setDependencies({});
    }
  };

  useEffect(() => {
    detectManager();
  }, [workspaceId]);

  // 3. Trigger Package Manager commands in terminal tab
  const handleAction = async (action: 'install' | 'add' | 'remove' | 'update', pkgName?: string) => {
    if (!workspaceId || (!managerId && ambiguousList.length === 0)) return;
    try {
      const res = await api.post(`/workspaces/${workspaceId}/execution/package/command`, {
        action,
        packageName: pkgName
      });
      
      const { command } = res.data;
      
      // Spawn command inside workspace PTY terminal tab
      const terminalStore = useTerminalStore.getState();
      terminalStore.createTerminal(workspaceId, command);
      
      // Clear input
      if (action === 'add') setNewPackage('');
      
      // Refresh dependencies list after brief delay
      setTimeout(() => loadDependencies(manifestFile), 3000);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to trigger package command.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-gray-300 text-xs p-3.5 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-2">
        <div className="flex items-center space-x-1.5">
          <Package className="text-blue-400" size={15} />
          <span className="font-bold text-gray-200 uppercase tracking-wider text-[10px]">Project Dependencies</span>
        </div>
        <button 
          onClick={detectManager}
          className="p-1 hover:bg-[#333] rounded transition-colors text-gray-400 hover:text-white"
          title="Reload settings"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Ambiguity Resolution Drawer (Module 39E) */}
      {ambiguousList.length > 0 && !managerId && (
        <div className="p-3 bg-yellow-950/20 border border-yellow-800/30 rounded-lg space-y-2">
          <div className="flex items-center space-x-1.5 text-yellow-500 font-semibold">
            <AlertCircle size={14} />
            <span>Multiple Lockfiles Detected</span>
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Select the package manager you want to use for this workspace session:
          </p>
          <div className="flex gap-2 mt-1">
            {ambiguousList.map((mgr) => (
              <button
                key={mgr}
                onClick={() => {
                  setManagerId(mgr);
                  if (mgr === 'yarn') setManifestFile('package.json');
                  else if (mgr === 'pnpm') setManifestFile('package.json');
                  else setManifestFile('package.json');
                  loadDependencies('package.json');
                }}
                className="px-2.5 py-1 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 border border-yellow-800/50 rounded font-semibold transition-colors"
              >
                Use {mgr.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Package Manager Status Banner */}
      {managerId && (
        <div className="flex items-center justify-between bg-[#252526]/50 p-2 border border-[#2d2d2d] rounded">
          <div>
            <span className="text-gray-400">Package Manager: </span>
            <span className="font-semibold text-blue-400 uppercase font-mono">{managerId}</span>
          </div>
          <button
            onClick={() => handleAction('install')}
            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold flex items-center space-x-1 shadow transition-colors"
          >
            <Play size={10} />
            <span>Install All</span>
          </button>
        </div>
      )}

      {/* Add Dependency Input Form */}
      {managerId && (
        <form 
          onSubmit={(e) => { e.preventDefault(); if (newPackage.trim()) handleAction('add', newPackage.trim()); }}
          className="flex space-x-2"
        >
          <input
            type="text"
            value={newPackage}
            onChange={(e) => setNewPackage(e.target.value)}
            placeholder="Add package (e.g. lodash)..."
            className="flex-1 bg-[#252526] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500"
          />
          <button
            type="submit"
            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded shadow transition-colors"
            title="Add Package"
          >
            <Plus size={13} />
          </button>
        </form>
      )}

      {/* Installed Packages List */}
      <div className="space-y-1.5">
        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Installed Packages</span>
        {Object.keys(dependencies).length === 0 ? (
          <div className="text-center text-gray-500 italic py-6 bg-[#252526]/20 border border-[#2d2d2d] rounded-lg">
            No dependencies found in {manifestFile}.
          </div>
        ) : (
          <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
            {Object.entries(dependencies).map(([name, version]) => (
              <div 
                key={name}
                className="flex items-center justify-between p-2 bg-[#252526]/40 border border-[#2d2d2d] rounded hover:bg-[#252526] transition-colors"
              >
                <div>
                  <div className="font-semibold text-gray-200 truncate max-w-[130px]">{name}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5 font-mono">{version}</div>
                </div>
                <div className="flex space-x-1">
                  <button
                    onClick={() => handleAction('update', name)}
                    className="p-1 text-gray-400 hover:text-blue-400 hover:bg-[#333] rounded transition-colors"
                    title="Update dependency"
                  >
                    <RefreshCw size={10} />
                  </button>
                  <button
                    onClick={() => handleAction('remove', name)}
                    className="p-1 text-gray-500 hover:text-red-400 hover:bg-[#333] rounded transition-colors"
                    title="Remove dependency"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
