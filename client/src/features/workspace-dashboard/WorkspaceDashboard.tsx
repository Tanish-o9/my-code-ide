import React, { useEffect, useState, useRef } from 'react';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import type { WorkspaceData } from '../../shared/stores/useWorkspaceStore';
import { api } from '../../shared/lib/api';
import { 
  Plus, 
  Folder, 
  Trash2, 
  Code, 
  Boxes, 
  Terminal, 
  Calendar,
  Sparkles,
  Loader2,
  AlertTriangle,
  X,
  FolderOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function WorkspaceDashboard() {
  const { workspaces, setWorkspaces, setActiveWorkspace, isLoading, setLoading, showCreateModal, setShowCreateModal } = useWorkspaceStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (showCreateModal) {
      setIsModalOpen(true);
      setCreationMode('local'); // Default to local tab
      setShowCreateModal(false);
    }
  }, [showCreateModal, setShowCreateModal]);

  const [workspaceName, setWorkspaceName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('Blank');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const [creationMode, setCreationMode] = useState<'template' | 'local'>('template');
  const [localFolderPath, setLocalFolderPath] = useState('');
  const [selectedFolderName, setSelectedFolderName] = useState('');
  const [scannedFiles, setScannedFiles] = useState<Array<{ path: string; content: string }>>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChooseFolder = () => {
    setCreateError(null);
    fileInputRef.current?.click();
  };

  const handleChooseFolderHTML5 = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    
    // Parse folder name from path or input value
    let folderName = 'uploaded-project';
    if (files && files.length > 0) {
      folderName = files[0].webkitRelativePath.split('/')[0] || 'uploaded-project';
    } else if (e.target.value) {
      const parts = e.target.value.replace(/\\/g, '/').split('/');
      folderName = parts[parts.length - 1] || 'uploaded-project';
    }

    setWorkspaceName(folderName);
    setSelectedFolderName(folderName);
    setCreateError(null);

    if (!files || files.length === 0) {
      setScannedFiles([]);
      return;
    }

    setIsCreating(true);

    try {
      const readFileAsBase64 = (file: File): Promise<string> => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const result = ev.target?.result as string || '';
            const commaIndex = result.indexOf(',');
            const base64 = commaIndex !== -1 ? result.substring(commaIndex + 1) : result;
            resolve(base64);
          };
          reader.onerror = () => resolve('');
          reader.readAsDataURL(file);
        });
      };

      const skipDirs = [
        'node_modules/',
        '.git/',
        'dist/',
        'build/',
        '.next/',
        '.cache/',
        'env/',
        'venv/',
        '.idea/',
        '.vscode/'
      ];

      // Read files in parallel
      const uploadPromises = Array.from(files).map(async (file) => {
        const fullPath = file.webkitRelativePath || '';
        const relativePath = fullPath.substring(fullPath.indexOf('/') + 1);

        const isIgnored = skipDirs.some(dir => relativePath.startsWith(dir) || relativePath.includes('/' + dir));
        if (isIgnored || relativePath.includes('/.') || relativePath.startsWith('.')) {
          return null;
        }

        const content = await readFileAsBase64(file);
        return {
          path: relativePath,
          content
        };
      });

      const results = await Promise.all(uploadPromises);
      const fileDataList = results.filter((f): f is { path: string; content: string } => f !== null);
      setScannedFiles(fileDataList);

    } catch (err: any) {
      console.error('[FolderUpload] Scan Error:', err);
      setCreateError('Failed to read folder contents.');
    } finally {
      setIsCreating(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleLocalFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) {
      setCreateError('Workspace name is required');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      // Create workspace and upload folder files directly
      const response = await api.post('/workspaces/upload', {
        name: workspaceName,
        files: scannedFiles
      });

      const newWorkspace: WorkspaceData = response.data;
      setWorkspaces([newWorkspace, ...workspaces]);
      setIsModalOpen(false);
      setWorkspaceName('');
      setSelectedFolderName('');
      setScannedFiles([]);
      
      // Open immediately in IDE
      setActiveWorkspace(newWorkspace);

    } catch (err: any) {
      console.error('[FolderUpload] Submit Error:', err);
      setCreateError(err.response?.data?.error || 'Failed to create workspace.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleLocalFolderDirectOpen = async () => {
    if (!localFolderPath.trim()) {
      setCreateError('Local folder path is required');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      // Guess workspace name if not specified
      const parts = localFolderPath.replace(/\\/g, '/').split('/');
      const lastPart = parts[parts.length - 1] || 'local-project';
      const wName = workspaceName.trim() || lastPart.replace(/"/g, '') || 'local-project';

      const response = await api.post('/workspaces', {
        name: wName,
        localFolderPath: localFolderPath
      });

      const newWorkspace: WorkspaceData = response.data;
      setWorkspaces([newWorkspace, ...workspaces]);
      setIsModalOpen(false);
      setWorkspaceName('');
      setLocalFolderPath('');
      setSelectedFolderName('');
      setScannedFiles([]);

      // Open immediately in IDE
      setActiveWorkspace(newWorkspace);
    } catch (err: any) {
      console.error('[LocalFolderDirectOpen] Error:', err);
      setCreateError(err.response?.data?.error || 'Failed to open local path.');
    } finally {
      setIsCreating(false);
    }
  };

  // Fetch workspaces on mount
  useEffect(() => {
    const fetchWorkspaces = async () => {
      setLoading(true);
      try {
        const response = await api.get('/workspaces');
        setWorkspaces(response.data);
      } catch (err) {
        console.error('Error fetching workspaces:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchWorkspaces();
  }, [setWorkspaces, setLoading]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) {
      setCreateError('Workspace name is required');
      return;
    }
    if (creationMode === 'local' && !localFolderPath.trim()) {
      setCreateError('Local folder path is required');
      return;
    }

    setCreateError(null);
    setIsCreating(true);

    try {
      const payload = creationMode === 'local'
        ? { name: workspaceName, localFolderPath }
        : { name: workspaceName, template: selectedTemplate };

      const response = await api.post('/workspaces', payload);
      
      const newWorkspace: WorkspaceData = response.data;
      setWorkspaces([newWorkspace, ...workspaces]);
      setIsModalOpen(false);
      setWorkspaceName('');
      setLocalFolderPath('');
      setSelectedTemplate('Blank');
      setCreationMode('template');
      
      // Select the new workspace
      setActiveWorkspace(newWorkspace);
    } catch (err: any) {
      setCreateError(err.response?.data?.error || 'Failed to create workspace');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this workspace? This deletes all files on disk permanently.')) {
      return;
    }

    try {
      await api.delete(`/workspaces/${id}`);
      setWorkspaces(workspaces.filter(w => w._id !== id));
    } catch (err) {
      console.error('Failed to delete workspace:', err);
      alert('Error deleting workspace');
    }
  };

  const getTemplateIcon = (template: string) => {
    switch (template) {
      case 'React':
        return <Boxes className="w-8 h-8 text-cyan-400" />;
      case 'Node.js':
        return <Code className="w-8 h-8 text-green-400" />;
      case 'Python':
        return <Terminal className="w-8 h-8 text-yellow-400" />;
      default:
        return <Folder className="w-8 h-8 text-blue-400" />;
    }
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-[#121214] text-white p-8 overflow-y-auto select-none">
      {/* Background Glows */}
      <div className="absolute top-10 left-10 w-[500px] h-[500px] rounded-full bg-blue-600/5 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-[500px] h-[500px] rounded-full bg-purple-600/5 blur-[120px] pointer-events-none"></div>

      <div className="max-w-6xl mx-auto z-10 relative">
        {/* Header */}
        <div className="flex justify-between items-center mb-10 pb-6 border-b border-[#2d2d30]">
          <div>
            <div className="flex items-center space-x-2 text-blue-400 text-xs font-semibold tracking-wider uppercase mb-1">
              <Sparkles size={14} />
              <span>Sandbox Environments</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Your Workspace Projects</h1>
          </div>

          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold text-sm transition-all cursor-pointer shadow-lg shadow-blue-500/10"
          >
            <Plus size={16} />
            <span>Create Workspace</span>
          </button>
        </div>

        {/* Workspaces Display */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-[#1c1c1f] border border-[#2d2d30] rounded-2xl p-6 h-40 animate-pulse">
                <div className="w-12 h-12 bg-gray-800 rounded-xl mb-4"></div>
                <div className="w-1/2 h-4 bg-gray-800 rounded mb-2"></div>
                <div className="w-1/3 h-3 bg-gray-800 rounded"></div>
              </div>
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <div className="text-center py-20 bg-[#1c1c1f]/50 border border-dashed border-[#2d2d30] rounded-2xl max-w-xl mx-auto">
            <Folder className="mx-auto w-16 h-16 text-gray-600 mb-4" />
            <h3 className="text-lg font-bold text-gray-300">No workspaces yet</h3>
            <p className="text-gray-500 text-xs mt-1 max-w-xs mx-auto">
              Create a workspace to initialize a dedicated project files directory and run terminal commands.
            </p>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Get Started
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workspaces.map((ws) => (
              <motion.div
                key={ws._id}
                onClick={() => setActiveWorkspace(ws)}
                whileHover={{ y: -4, borderColor: '#3b82f6', boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.1)' }}
                className="bg-[#1c1c1f] border border-[#2d2d30] rounded-2xl p-6 cursor-pointer flex flex-col justify-between h-40 transition-all relative group"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div className="p-2.5 bg-[#141416] border border-[#2d2d30] rounded-xl mb-3">
                      {getTemplateIcon(ws.templateUsed)}
                    </div>
                    <button 
                      onClick={(e) => handleDelete(ws._id, e)}
                      className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded-lg text-gray-500 hover:text-red-400 transition-all cursor-pointer"
                      title="Delete project"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <h3 className="font-bold text-sm text-gray-200 group-hover:text-white transition-colors truncate">{ws.name}</h3>
                </div>

                <div className="flex items-center justify-between text-[10px] text-gray-500 border-t border-[#2d2d30]/50 pt-3">
                  <div className="flex items-center space-x-1.5">
                    <Calendar size={12} />
                    <span>Updated {new Date(ws.lastAccessedAt).toLocaleDateString()}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full font-semibold border ${
                    ws.containerStatus === 'running' 
                      ? 'bg-green-500/10 border-green-500/20 text-green-400' 
                      : ws.containerStatus === 'provisioning'
                      ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400 animate-pulse'
                      : 'bg-gray-500/10 border-gray-500/20 text-gray-400'
                  }`}>
                    {ws.containerStatus}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Creation Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-xl bg-[#1c1c1f] border border-[#2d2d30] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center p-5 border-b border-[#2d2d30]">
                <h2 className="text-md font-bold flex items-center space-x-2">
                  <Plus size={18} className="text-blue-500" />
                  <span>Configure New Workspace</span>
                </h2>
                <button 
                  onClick={() => {
                    setIsModalOpen(false);
                    setWorkspaceName('');
                    setSelectedTemplate('Blank');
                    setCreateError(null);
                  }}
                  className="text-gray-400 hover:text-white p-1 hover:bg-[#2d2d30] rounded-lg transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-6 space-y-5">
                {createError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs text-center flex items-center justify-center space-x-1.5">
                    <AlertTriangle size={14} />
                    <span>{createError}</span>
                  </div>
                )}

                {/* Sliding tabs header */}
                <div className="flex bg-[#141416] p-1 rounded-xl border border-[#2d2d30] relative select-none">
                  <button
                    type="button"
                    onClick={() => {
                      setCreationMode('template');
                      setCreateError(null);
                    }}
                    className={`flex-1 py-2 text-center text-xs font-bold transition-colors duration-200 z-10 ${
                      creationMode === 'template' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Sandbox Template
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreationMode('local');
                      setCreateError(null);
                    }}
                    className={`flex-1 py-2 text-center text-xs font-bold transition-colors duration-200 z-10 ${
                      creationMode === 'local' ? 'text-white' : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Local Laptop Folder
                  </button>
                  <div
                    className="absolute top-1 bottom-1 rounded-lg bg-blue-600 transition-all duration-300 ease-out"
                    style={{
                      left: creationMode === 'template' ? '4px' : 'calc(50% + 2px)',
                      right: creationMode === 'template' ? 'calc(50% + 2px)' : '4px',
                    }}
                  />
                </div>

                {creationMode === 'template' ? (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Workspace Name</label>
                      <input 
                        type="text" 
                        value={workspaceName}
                        onChange={(e) => setWorkspaceName(e.target.value)}
                        placeholder="my-cool-project"
                        className="w-full bg-[#141416] border border-[#2d2d30] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                        required
                      />
                    </div>

                    <div className="space-y-2 animate-fadeIn">
                      <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Starter Template</label>
                      <div className="grid grid-cols-2 gap-4">
                        {['Blank', 'Node.js', 'React', 'Python'].map((tmpl) => (
                          <div 
                            key={tmpl}
                            onClick={() => setSelectedTemplate(tmpl)}
                            className={`flex items-center space-x-3 p-3 bg-[#141416] border rounded-xl cursor-pointer hover:border-gray-500 transition-colors ${
                              selectedTemplate === tmpl ? 'border-blue-500 ring-1 ring-blue-500' : 'border-[#2d2d30]'
                            }`}
                          >
                            <div className="p-1.5 bg-[#1c1c1f] rounded-lg">
                              {getTemplateIcon(tmpl)}
                            </div>
                            <div>
                              <div className="text-xs font-bold">{tmpl}</div>
                              <div className="text-[9px] text-gray-500">
                                {tmpl === 'Blank' && 'Empty directory'}
                                {tmpl === 'Node.js' && 'Node setup + package.json'}
                                {tmpl === 'React' && 'Vite + React setup'}
                                {tmpl === 'Python' && 'Simple main.py'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end space-x-3 border-t border-[#2d2d30] pt-5 mt-4">
                      <button 
                        type="button"
                        onClick={() => {
                          setIsModalOpen(false);
                          setWorkspaceName('');
                          setSelectedTemplate('Blank');
                          setCreateError(null);
                        }}
                        className="px-4 py-2 rounded-xl border border-[#2d2d30] hover:bg-[#2d2d30] text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit"
                        disabled={isCreating}
                        className="flex items-center space-x-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold transition-colors cursor-pointer shadow-lg shadow-blue-500/10 disabled:opacity-50"
                      >
                        {isCreating ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            <span>Provisioning...</span>
                          </>
                        ) : (
                          <span>Initialize Sandbox</span>
                        )}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4 animate-fadeIn">
                    {!selectedFolderName ? (
                      <div className="space-y-4">
                        {/* Option A: Paste Path (Direct Mount) */}
                        <div className="space-y-2 bg-[#141416]/30 p-4 rounded-xl border border-[#2d2d30]">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Option 1: Confirm Absolute Path on Laptop</label>
                          <div className="flex space-x-2">
                            <input 
                              type="text" 
                              value={localFolderPath}
                              onChange={(e) => {
                                setLocalFolderPath(e.target.value);
                                // Auto guess workspace name from path
                                const parts = e.target.value.replace(/\\/g, '/').split('/');
                                const lastPart = parts[parts.length - 1] || '';
                                setWorkspaceName(lastPart.replace(/"/g, ''));
                              }}
                              placeholder="e.g. C:\Users\tanis\OneDrive\Desktop\lala"
                              className="flex-1 bg-[#1c1c1f] border border-[#2d2d30] rounded-xl px-4 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                            />
                            <button
                              type="button"
                              onClick={handleLocalFolderDirectOpen}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white rounded-xl transition-colors cursor-pointer"
                            >
                              Open Path
                            </button>
                          </div>
                          <span className="text-[10px] text-gray-500 block leading-normal">
                            Highly recommended: Edits files directly in-place on your laptop. Works with OneDrive folders.
                          </span>
                        </div>

                        {/* Divider */}
                        <div className="flex items-center my-2">
                          <div className="flex-1 border-t border-[#2d2d30]"></div>
                          <span className="px-3 text-[10px] text-gray-600 uppercase font-bold tracking-wider">OR</span>
                          <div className="flex-1 border-t border-[#2d2d30]"></div>
                        </div>

                        {/* Option B: Browser Upload */}
                        <div 
                          onClick={handleChooseFolder}
                          className="py-6 flex flex-col items-center justify-center border-2 border-dashed border-[#2d2d30] hover:border-blue-500/50 rounded-2xl bg-[#141416]/50 hover:bg-[#141416] transition-all cursor-pointer group space-y-3 min-h-[140px]"
                        >
                          {isCreating ? (
                            <>
                              <Loader2 size={32} className="animate-spin text-blue-500" />
                              <div className="text-center space-y-1">
                                <div className="text-xs font-bold text-gray-200">Scanning local files...</div>
                                <div className="text-[10px] text-gray-500">Evaluating directory structure, please wait.</div>
                              </div>
                            </>
                          ) : (
                            <>
                              <FolderOpen size={32} className="text-blue-500 group-hover:scale-110 transition-transform duration-300 animate-pulse" />
                              <div className="text-center space-y-1">
                                <div className="text-xs font-bold text-gray-200 group-hover:text-blue-400 transition-colors">Option 2: Choose & Upload Folder via Browser</div>
                                <div className="text-[10px] text-gray-500 max-w-xs px-6">
                                  Will upload and save a copy of the selected folder inside server workspace storage.
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 bg-[#141416] p-5 rounded-2xl border border-[#2d2d30]">
                        <div className="flex items-center space-x-3">
                          <div className="p-2.5 bg-blue-600/10 rounded-xl border border-blue-500/20">
                            <FolderOpen className="text-blue-400 w-6 h-6" />
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 uppercase font-bold tracking-wider">Selected Folder</div>
                            <div className="text-sm font-bold text-white font-mono">{selectedFolderName}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {scannedFiles.length === 0 ? 'Empty folder / 0 files' : `${scannedFiles.length} files scanned`}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-2">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Workspace Name</label>
                          <input 
                            type="text" 
                            value={workspaceName}
                            onChange={(e) => setWorkspaceName(e.target.value)}
                            placeholder="workspace-name"
                            className="w-full bg-[#1c1c1f] border border-[#2d2d30] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
                            required
                          />
                        </div>

                        <div className="flex items-center justify-between border-t border-[#2d2d30] pt-4 mt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFolderName('');
                              setScannedFiles([]);
                            }}
                            className="text-xs text-gray-400 hover:text-white font-semibold transition-colors cursor-pointer"
                          >
                            Choose Different Folder
                          </button>

                          <button
                            type="button"
                            onClick={handleLocalFolderSubmit}
                            disabled={isCreating}
                            className="flex items-center space-x-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer shadow-lg shadow-blue-500/10 disabled:opacity-50"
                          >
                            {isCreating ? (
                              <>
                                <Loader2 size={13} className="animate-spin" />
                                <span>Creating Workspace...</span>
                              </>
                            ) : (
                              <span>Open Folder</span>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleChooseFolderHTML5}
                      className="hidden"
                      {...{ webkitdirectory: "", directory: "" }}
                      multiple
                    />
                    
                    {!selectedFolderName && (
                      <div className="flex justify-end border-t border-[#2d2d30] pt-5 mt-4">
                        <button 
                          type="button"
                          onClick={() => {
                            setIsModalOpen(false);
                            setCreateError(null);
                          }}
                          className="px-4 py-2 rounded-xl border border-[#2d2d30] hover:bg-[#2d2d30] text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


    </div>
  );
}
