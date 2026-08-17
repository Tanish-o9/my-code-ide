import React, { useEffect, useState } from 'react';
import { useGitStore } from '../../shared/stores/useGitStore';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { useEditorStore } from '../../shared/stores/useEditorStore';
import { 
  GitBranch, 
  GitCommit, 
  RefreshCw, 
  Plus, 
  Minus, 
  Check, 
  AlertCircle, 
  X, 
  FileText,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Settings,
  Copy,
  Globe,
  Key,
  RotateCcw
} from 'lucide-react';
import DiffViewer from '../../shared/components/DiffViewer';
import ConflictResolver from '../../shared/components/ConflictResolver';

export default function SourceControlPanel() {
  const { activeWorkspace } = useWorkspaceStore();
  const { openTab, focusLine } = useEditorStore();
  const {
    activeBranch,
    branches,
    staged,
    unstaged,
    untracked,
    conflicted,
    selectedFileDiff,
    selectedFileName,
    isStagedDiff,
    loading,
    error,
    syncAhead,
    syncBehind,
    remoteUrl,
    remoteAuthType,
    sshPublicKey,
    hasRemoteCredentials,
    fetchStatus,
    fetchBranches,
    stageFiles,
    unstageFiles,
    commit,
    switchBranch,
    createBranch,
    clearDiff,
    fetchSyncStatus,
    fetchRemoteSettings,
    configureRemoteSettings,
    push,
    pull,
    history,
    fetchHistory,
    discardChanges,
    initRepo,
    cloneRepo,
    stashChanges,
    rebase,
    cherryPick
  } = useGitStore();

  const [commitMsg, setCommitMsg] = useState('');
  const [amend, setAmend] = useState(false);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [showCreateBranchModal, setShowCreateBranchModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [conflictModal, setConflictModal] = useState<{
    branchName: string;
    message: string;
  } | null>(null);

  // Remote Credentials settings modal states
  const [showRemoteModal, setShowRemoteModal] = useState(false);
  const [remoteFormUrl, setRemoteFormUrl] = useState('');
  const [remoteFormAuthType, setRemoteFormAuthType] = useState<'token' | 'ssh'>('token');
  const [remoteFormToken, setRemoteFormToken] = useState('');
  const [remoteFormPrivateKey, setRemoteFormPrivateKey] = useState('');
  const [sshCopied, setSshCopied] = useState(false);

  // Active view switcher (Changes vs history) (Module 70)
  const [activeSubTab, setActiveSubTab] = useState<'changes' | 'history'>('changes');

  // Sections expansion
  const [expStaged, setExpStaged] = useState(true);
  const [expUnstaged, setExpUnstaged] = useState(true);
  const [expUntracked, setExpUntracked] = useState(true);

  const workspaceId = activeWorkspace?._id || '';

  useEffect(() => {
    if (workspaceId) {
      fetchStatus(workspaceId);
      fetchBranches(workspaceId);
      fetchSyncStatus(workspaceId);
      fetchRemoteSettings(workspaceId);
    }
  }, [workspaceId, fetchStatus, fetchBranches, fetchSyncStatus, fetchRemoteSettings]);

  useEffect(() => {
    if (showRemoteModal) {
      setRemoteFormUrl(remoteUrl);
      setRemoteFormAuthType(remoteAuthType);
      setRemoteFormToken('');
      setRemoteFormPrivateKey('');
      setSshCopied(false);
    }
  }, [showRemoteModal, remoteUrl, remoteAuthType]);

  useEffect(() => {
    if (workspaceId && activeSubTab === 'history') {
      fetchHistory(workspaceId);
    }
  }, [workspaceId, activeSubTab, fetchHistory]);

  const handleRefresh = () => {
    if (workspaceId) {
      fetchStatus(workspaceId);
      fetchBranches(workspaceId);
      fetchSyncStatus(workspaceId);
    }
  };

  const handlePull = async () => {
    if (!workspaceId) return;
    const res = await pull(workspaceId);
    if (!res.success) {
      if (res.code === 'NEEDS_MERGE') {
        alert('Pull completed with merge conflicts. Please resolve files highlighted in red.');
      } else {
        alert(`Pull failed: ${res.message}`);
      }
    } else {
      alert('Pulled successfully.');
    }
  };

  const handlePush = async () => {
    if (!workspaceId) return;
    const res = await push(workspaceId);
    if (!res.success) {
      alert(`Push failed: ${res.message}`);
    } else {
      alert('Pushed successfully.');
    }
  };

  const handleRemoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await configureRemoteSettings(workspaceId, {
        remoteUrl: remoteFormUrl,
        authType: remoteFormAuthType,
        token: remoteFormToken || undefined,
        sshPrivateKey: remoteFormPrivateKey || undefined,
      });
      setShowRemoteModal(false);
    } catch (err) {
      // Error handled by store
    }
  };


  const handleCommitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMsg.trim() && !amend) return;
    try {
      await commit(workspaceId, commitMsg, amend);
      setCommitMsg('');
      setAmend(false);
    } catch (err) {
      // Error handled by store
    }
  };

  const handleSelectBranch = async (branch: string) => {
    setBranchDropdownOpen(false);
    if (branch === activeBranch) return;
    
    const res = await switchBranch(workspaceId, branch);
    if (!res.success) {
      if (res.code === 'DIRTY_TREE' || res.code === 'COLLAB_ACTIVE') {
        setConflictModal({
          branchName: branch,
          message: res.message || 'Branch switch conflict detected.',
        });
      } else {
        alert(res.message || 'Failed to switch branch');
      }
    }
  };

  const handleConflictResolve = async (action: 'stash' | 'force' | 'cancel') => {
    if (!conflictModal) return;
    const targetBranch = conflictModal.branchName;
    setConflictModal(null);

    if (action === 'cancel') return;

    await switchBranch(workspaceId, targetBranch, action === 'force' ? true : 'stash');
  };

  const handleCreateBranchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    try {
      await createBranch(workspaceId, newBranchName.trim());
      // Auto switch
      await switchBranch(workspaceId, newBranchName.trim());
      setNewBranchName('');
      setShowCreateBranchModal(false);
    } catch (err) {
      // Error handled by store
    }
  };

  const handleDiffClick = (file: string, _isStaged: boolean) => {
    openTab(workspaceId, 'git-diff:' + file);
  };

  const handleDiffLineClick = async (filePath: string, line: number) => {
    await openTab(workspaceId, filePath);
    focusLine(filePath, line);
  };

  const isNotGitRepo = error?.includes('not a git repository') || error?.includes('Not a git repository') || error?.includes('no git') || error?.includes('128');
  if (isNotGitRepo) {
    return (
      <div className="flex-grow w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-4 bg-[#1e1e1e] text-gray-400 select-none border-r border-[#2d2d2d]">
        <GitBranch size={48} className="text-gray-600 shrink-0" />
        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-gray-200">No Git Repository Found</h4>
          <p className="text-[10px] text-gray-500 leading-normal max-w-[220px]">
            This folder is not yet initialized as a Git repository.
          </p>
        </div>
        <div className="flex flex-col w-full space-y-2.5 max-w-[200px]">
          <button
            onClick={() => initRepo(workspaceId)}
            className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5"
          >
            <Check size={12} />
            <span>Initialize Repository</span>
          </button>
          
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-[#2d2d2d]"></div>
            <span className="flex-shrink mx-2 text-[8px] uppercase tracking-wider text-gray-600">or</span>
            <div className="flex-grow border-t border-[#2d2d2d]"></div>
          </div>

          <div className="space-y-1.5">
            <input
              type="text"
              id="git-clone-url-input"
              placeholder="Git repository clone URL..."
              className="w-full bg-[#1c1c1f] border border-[#2d2d2d] rounded px-2 py-1.5 text-[10px] outline-none text-gray-200 placeholder-gray-600 focus:border-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const url = (e.target as HTMLInputElement).value;
                  if (url) {
                    cloneRepo(workspaceId, url);
                  }
                }
              }}
            />
            <p className="text-[8px] text-gray-600">Press Enter to clone</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-[#181818] text-gray-300">
      {/* Left panel: Files List & Staging Controls */}
      <div className="w-80 border-r border-[#2d2d2d] flex flex-col h-full bg-[#1e1e1e]">
        {/* Branch switcher & Toolbar */}
        <div className="p-3 border-b border-[#2d2d2d] flex items-center justify-between relative bg-[#222222]">
          <div className="relative">
            <button
              onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
              className="flex items-center space-x-1.5 px-2 py-1 bg-[#2b2b2b] hover:bg-[#383838] border border-[#3e3e3e] rounded text-xs text-gray-200 transition-colors"
            >
              <GitBranch size={13} className="text-blue-400" />
              <span className="truncate max-w-[120px] font-semibold">{activeBranch || 'master'}</span>
              <ChevronDown size={11} className="text-gray-400" />
            </button>
            
            {branchDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-56 bg-[#252526] border border-[#3c3c3c] rounded shadow-lg z-50 py-1 text-xs">
                <div className="px-3 py-1 text-[10px] text-gray-500 font-bold uppercase tracking-wider">Branches</div>
                {branches.map((b) => (
                  <button
                    key={b}
                    onClick={() => handleSelectBranch(b)}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#37373d] transition-colors flex items-center justify-between"
                  >
                    <span className={b === activeBranch ? 'text-blue-400 font-semibold' : ''}>{b}</span>
                    {b === activeBranch && <Check size={11} className="text-blue-400" />}
                  </button>
                ))}
                <div className="border-t border-[#3c3c3c] mt-1 pt-1">
                  <button
                    onClick={() => {
                      setBranchDropdownOpen(false);
                      setShowCreateBranchModal(true);
                    }}
                    className="w-full text-left px-3 py-1.5 text-blue-400 hover:bg-[#37373d] font-semibold transition-colors flex items-center space-x-1.5"
                  >
                    <Plus size={11} />
                    <span>Create Branch...</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            {/* Sync ahead/behind indicators */}
            {(syncAhead > 0 || syncBehind > 0) && (
              <span className="text-[10px] bg-[#2b2b2b] px-1.5 py-0.5 rounded text-gray-400 font-mono" title={`Ahead: ${syncAhead}, Behind: ${syncBehind}`}>
                ↑{syncAhead} ↓{syncBehind}
              </span>
            )}

            <button
              onClick={handlePull}
              className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white transition-colors"
              title="Pull from Remote"
            >
              <ArrowDown size={13} />
            </button>
            <button
              onClick={handlePush}
              className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white transition-colors"
              title="Push to Remote"
            >
              <ArrowUp size={13} />
            </button>
            <button
              onClick={() => setShowRemoteModal(true)}
              className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white transition-colors"
              title="Configure Git Remote Settings"
            >
              <Settings size={13} />
            </button>
            <button
              onClick={() => openTab(workspaceId, 'git-graph')}
              className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white transition-colors"
              title="Open Git Graph"
            >
              <GitBranch size={13} />
            </button>
            <button
              onClick={handleRefresh}
              className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white transition-colors"
              title="Refresh Git Status"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Sub-tabs switcher (Module 70) */}
        <div className="flex border-b border-[#2d2d2d] bg-[#1e1e1e] text-[10px] uppercase font-bold tracking-wider select-none text-gray-500">
          <button
            type="button"
            onClick={() => setActiveSubTab('changes')}
            className={`flex-1 py-2 text-center border-b transition-colors ${
              activeSubTab === 'changes'
                ? 'border-blue-500 text-blue-400 bg-[#252526]/30'
                : 'border-transparent hover:text-white'
            }`}
          >
            Changes
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('history')}
            className={`flex-1 py-2 text-center border-b transition-colors ${
              activeSubTab === 'history'
                ? 'border-blue-500 text-blue-400 bg-[#252526]/30'
                : 'border-transparent hover:text-white'
            }`}
          >
            History
          </button>
        </div>

        {activeSubTab === 'changes' ? (
          <>
            {/* Change lists */}
            <div className="flex-1 overflow-y-auto p-2 space-y-4">
              {error && (
                <div className="p-2 bg-red-950/30 border border-red-900/50 rounded flex items-start space-x-1.5 text-xs text-red-300">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Staged Changes Section */}
              <div>
                <div className="flex items-center justify-between px-1.5 py-1 text-[10px] uppercase font-bold tracking-wider text-gray-400 hover:text-white select-none">
                  <button 
                    type="button"
                    onClick={() => setExpStaged(!expStaged)} 
                    className="flex items-center space-x-1"
                  >
                    {expStaged ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    <span>Staged Changes ({staged.length})</span>
                  </button>
                  {staged.length > 0 && (
                    <button
                      type="button"
                      onClick={() => unstageFiles(workspaceId, staged)}
                      className="text-[10px] text-blue-400 hover:underline hover:text-blue-300 transition-colors"
                    >
                      Unstage All
                    </button>
                  )}
                </div>

                {expStaged && (
                  <div className="mt-1 space-y-0.5">
                    {staged.length === 0 ? (
                      <div className="px-3 py-2 text-[10px] text-gray-600 italic select-none">
                        No staged changes
                      </div>
                    ) : (
                      staged.map((file) => (
                        <div 
                          key={file} 
                          onClick={() => handleDiffClick(file, true)}
                          className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer group text-xs transition-colors ${
                            selectedFileName === file && isStagedDiff
                              ? 'bg-[#37373d] text-white' 
                              : 'hover:bg-[#252526] text-gray-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <FileText size={12} className="text-green-400 shrink-0" />
                            <span className="truncate">{file}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <span className="text-[10px] text-green-400 font-mono select-none">A</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                unstageFiles(workspaceId, [file]);
                              }}
                              className="p-1 hover:bg-[#333] text-gray-400 hover:text-red-400 rounded transition-colors"
                              title="Unstage File"
                            >
                              <Minus size={11} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Unstaged Changes Section */}
              <div>
                <div className="flex items-center justify-between px-1.5 py-1 text-[10px] uppercase font-bold tracking-wider text-gray-400 hover:text-white select-none">
                  <button 
                    type="button"
                    onClick={() => setExpUnstaged(!expUnstaged)} 
                    className="flex items-center space-x-1"
                  >
                    {expUnstaged ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    <span>Unstaged Changes ({unstaged.length})</span>
                  </button>
                  {unstaged.length > 0 && (
                    <button
                      type="button"
                      onClick={() => stageFiles(workspaceId, unstaged)}
                      className="text-[10px] text-blue-400 hover:underline hover:text-blue-300 transition-colors"
                    >
                      Stage All
                    </button>
                  )}
                </div>

                {expUnstaged && (
                  <div className="mt-1 space-y-0.5">
                    {unstaged.length === 0 ? (
                      <div className="px-3 py-2 text-[10px] text-gray-600 italic select-none">
                        No unstaged changes
                      </div>
                    ) : (
                      unstaged.map((file) => {
                        const isConflictedFile = conflicted.includes(file);
                        return (
                          <div 
                            key={file} 
                            onClick={() => handleDiffClick(file, false)}
                            className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer group text-xs transition-colors ${
                              selectedFileName === file && !isStagedDiff
                                ? 'bg-[#37373d] text-white' 
                                : 'hover:bg-[#252526] text-gray-300'
                            }`}
                          >
                            <div className="flex items-center space-x-2 truncate">
                              <FileText size={12} className={isConflictedFile ? "text-yellow-500 shrink-0" : "text-blue-400 shrink-0"} />
                              <span className={`truncate ${isConflictedFile ? "text-yellow-400 font-semibold" : ""}`}>{file}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <span className={`text-[10px] font-mono select-none ${isConflictedFile ? "text-yellow-500 font-bold" : "text-blue-400"}`}>
                                {isConflictedFile ? '!' : 'M'}
                              </span>
                              {!isConflictedFile && (
                                <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`Are you sure you want to discard all changes in ${file}?`)) {
                                        discardChanges(workspaceId, file);
                                      }
                                    }}
                                    className="p-1 hover:bg-[#333] text-gray-400 hover:text-red-400 rounded transition-colors"
                                    title="Discard Changes"
                                  >
                                    <RotateCcw size={11} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      stageFiles(workspaceId, [file]);
                                    }}
                                    className="p-1 hover:bg-[#333] text-gray-400 hover:text-green-400 rounded transition-colors"
                                    title="Stage File"
                                  >
                                    <Plus size={11} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Untracked Changes Section */}
              <div>
                <div className="flex items-center justify-between px-1.5 py-1 text-[10px] uppercase font-bold tracking-wider text-gray-400 hover:text-white select-none">
                  <button 
                    type="button"
                    onClick={() => setExpUntracked(!expUntracked)} 
                    className="flex items-center space-x-1"
                  >
                    {expUntracked ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                    <span>Untracked Files ({untracked.length})</span>
                  </button>
                  {untracked.length > 0 && (
                    <button
                      type="button"
                      onClick={() => stageFiles(workspaceId, untracked)}
                      className="text-[10px] text-blue-400 hover:underline hover:text-blue-300 transition-colors"
                    >
                      Stage All
                    </button>
                  )}
                </div>

                {expUntracked && (
                  <div className="mt-1 space-y-0.5">
                    {untracked.length === 0 ? (
                      <div className="px-3 py-2 text-[10px] text-gray-600 italic select-none">
                        No untracked files
                      </div>
                    ) : (
                      untracked.map((file) => (
                        <div 
                          key={file} 
                          onClick={() => handleDiffClick(file, false)}
                          className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer group text-xs transition-colors ${
                            selectedFileName === file && !isStagedDiff
                              ? 'bg-[#37373d] text-white' 
                              : 'hover:bg-[#252526] text-gray-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <FileText size={12} className="text-gray-400 shrink-0" />
                            <span className="truncate">{file}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <span className="text-[10px] text-gray-500 font-mono select-none">U</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                stageFiles(workspaceId, [file]);
                              }}
                              className="p-1 hover:bg-[#333] text-gray-400 hover:text-green-400 rounded transition-colors"
                              title="Stage File"
                            >
                              <Plus size={11} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Commit Composer Form (Module 64) */}
            <form onSubmit={handleCommitSubmit} className="p-3 border-t border-[#2d2d2d] bg-[#222222] space-y-2">
              <textarea
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="Commit message (Ctrl+Enter to commit)..."
                rows={2}
                className="w-full bg-[#1e1e1e] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded p-1.5 text-xs resize-none text-gray-200 placeholder-gray-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    handleCommitSubmit(e);
                  }
                }}
              />
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center space-x-1.5 text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={amend}
                    onChange={(e) => setAmend(e.target.checked)}
                    className="rounded border-[#3e3e3e] bg-[#1e1e1e] text-blue-600 focus:ring-0"
                  />
                  <span>Amend</span>
                </label>
                <button
                  type="submit"
                  disabled={staged.length === 0 && !amend}
                  className="flex items-center space-x-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-[#2b2b2b] disabled:text-gray-500 rounded text-white font-semibold transition-colors"
                >
                  <GitCommit size={12} />
                  <span>Commit ({staged.length})</span>
                </button>
              </div>
            </form>
          </>
        ) : (
          /* Commit History List (Module 70) */
          <div className="flex-1 overflow-y-auto p-2 space-y-2.5">
            {history.length === 0 ? (
              <div className="text-center text-gray-500 text-xs py-8">
                No commits found in this repository.
              </div>
            ) : (
              history.map((commitItem) => (
                <div
                  key={commitItem.hash}
                  className="p-2.5 bg-[#252526] hover:bg-[#2e2e30] border border-[#2d2d30] rounded-xl flex items-start space-x-2.5 transition-colors cursor-pointer group"
                  title={`Commit: ${commitItem.hash}`}
                >
                  {/* Initials avatar icon */}
                  <div className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold uppercase shrink-0">
                    {(commitItem.author || 'U').charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col space-y-0.5">
                    <span className="text-[11px] font-semibold text-gray-200 truncate group-hover:text-white transition-colors">
                      {commitItem.message}
                    </span>
                    <div className="flex items-center text-[10px] text-gray-500 space-x-1.5 truncate">
                      <span className="font-semibold text-gray-400 truncate max-w-[80px]">{commitItem.author}</span>
                      <span>•</span>
                      <span>{new Date(commitItem.date).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <span className="text-[9px] font-mono bg-[#1e1e1e] border border-[#2d2d30] px-1 rounded text-gray-500 group-hover:text-gray-400 shrink-0">
                    {commitItem.hash.substring(0, 7)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right panel: Active Diff / Conflict View (Module 63/69/73) */}
      <div className="flex-1 h-full flex flex-col min-w-0">
        {selectedFileName ? (
          conflicted.includes(selectedFileName) ? (
            <ConflictResolver
              filePath={selectedFileName}
              onResolve={() => {
                clearDiff();
                fetchStatus(workspaceId);
              }}
            />
          ) : (
            <div className="flex-1 h-full min-h-0">
              <DiffViewer
                diffs={selectedFileDiff}
                filePath={selectedFileName}
                onLineClick={handleDiffLineClick}
              />
            </div>
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-xs p-8 space-y-2 select-none bg-[#141414]">
            <GitBranch size={32} className="text-gray-600" />
            <span>Select a changed file to inspect diffs</span>
          </div>
        )}
      </div>

      {/* Branch switch Conflict Reconciliation Modal (Module 65) */}
      {conflictModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center space-x-2 text-yellow-500">
              <AlertCircle size={20} />
              <h3 className="font-bold text-sm text-gray-200">Uncommitted Changes Detected</h3>
            </div>
            <p className="text-xs text-gray-400">
              {conflictModal.message} How would you like to proceed switching to <span className="font-semibold text-gray-200">{conflictModal.branchName}</span>?
            </p>
            <div className="flex justify-end space-x-2 text-xs">
              <button
                onClick={() => handleConflictResolve('cancel')}
                className="px-3 py-1.5 hover:bg-[#2b2b2b] border border-[#3e3e3e] rounded text-gray-300 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConflictResolve('force')}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white font-semibold"
              >
                Discard & Switch
              </button>
              <button
                onClick={() => handleConflictResolve('stash')}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-white font-semibold"
              >
                Stash & Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Branch Modal */}
      {showCreateBranchModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <form 
            onSubmit={handleCreateBranchSubmit}
            className="bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg shadow-xl w-full max-w-sm p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-200">Create New Branch</h3>
              <button
                type="button"
                onClick={() => setShowCreateBranchModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Branch Name</label>
              <input
                type="text"
                autoFocus
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="e.g. feature/auth-fix"
                className="w-full bg-[#2a2a2b] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded px-3 py-2 text-xs text-gray-200 placeholder-gray-500"
              />
            </div>
            <div className="flex justify-end space-x-2 text-xs pt-2">
              <button
                type="button"
                onClick={() => setShowCreateBranchModal(false)}
                className="px-3 py-1.5 hover:bg-[#2b2b2b] border border-[#3e3e3e] rounded text-gray-300 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newBranchName.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-[#2b2b2b] disabled:text-gray-500 rounded text-white font-semibold transition-colors"
              >
                Create Branch
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Remote Settings Modal (Module 66) */}
      {showRemoteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <form 
            onSubmit={handleRemoteSubmit}
            className="bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg shadow-xl w-full max-w-md p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-gray-200">
                <Globe size={16} className="text-blue-400" />
                <h3 className="font-bold text-sm">Git Remote Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRemoteModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Remote URL */}
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Remote Repository URL</label>
                <input
                  type="text"
                  required
                  value={remoteFormUrl}
                  onChange={(e) => setRemoteFormUrl(e.target.value)}
                  placeholder="https://github.com/username/repo.git or git@github.com:username/repo.git"
                  className="w-full bg-[#2a2a2b] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded px-3 py-2 text-xs text-gray-200 placeholder-gray-500"
                />
              </div>

              {/* Auth Type selection */}
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Authentication Method</label>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setRemoteFormAuthType('token')}
                    className={`flex-1 py-1.5 rounded border text-center font-semibold transition-colors ${
                      remoteFormAuthType === 'token'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                        : 'border-[#3e3e3e] text-gray-400 hover:text-white hover:bg-[#252526]'
                    }`}
                  >
                    Personal Access Token
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoteFormAuthType('ssh')}
                    className={`flex-1 py-1.5 rounded border text-center font-semibold transition-colors ${
                      remoteFormAuthType === 'ssh'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                        : 'border-[#3e3e3e] text-gray-400 hover:text-white hover:bg-[#252526]'
                    }`}
                  >
                    SSH Key Pair
                  </button>
                </div>
              </div>

              {/* Token authentication fields */}
              {remoteFormAuthType === 'token' && (
                <div className="space-y-1">
                  <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Personal Access Token (PAT)</label>
                  <input
                    type="password"
                    value={remoteFormToken}
                    onChange={(e) => setRemoteFormToken(e.target.value)}
                    placeholder={hasRemoteCredentials ? "•••••••••••••••••••• (Leave blank to keep current)" : "Enter token credentials..."}
                    className="w-full bg-[#2a2a2b] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded px-3 py-2 text-xs text-gray-200 placeholder-gray-500"
                  />
                  <span className="text-[10px] text-gray-500">
                    GitHub PAT, GitLab token, or HTTP credentials. Masked at rest.
                  </span>
                </div>
              )}

              {/* SSH authentication fields */}
              {remoteFormAuthType === 'ssh' && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                        <Key size={10} />
                        <span>SSH Public Key</span>
                      </label>
                      {sshPublicKey && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(sshPublicKey);
                            setSshCopied(true);
                            setTimeout(() => setSshCopied(false), 2000);
                          }}
                          className="text-[10px] text-blue-400 hover:underline flex items-center space-x-1"
                        >
                          <Copy size={9} />
                          <span>{sshCopied ? 'Copied!' : 'Copy Key'}</span>
                        </button>
                      )}
                    </div>
                    {sshPublicKey ? (
                      <textarea
                        readOnly
                        value={sshPublicKey}
                        rows={3}
                        className="w-full bg-[#141414] border border-[#3e3e3e] rounded p-2 text-[10px] font-mono text-gray-400 outline-none resize-none"
                      />
                    ) : (
                      <div className="p-3 bg-[#141414] border border-[#3e3e3e] rounded text-center text-gray-500 text-[10px]">
                        SSH Key Pair will be generated automatically upon saving.
                      </div>
                    )}
                    <span className="text-[10px] text-gray-500">
                      Copy this public key and add it to your git provider (e.g. GitHub &rarr; SSH Keys).
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Custom Private Key (Optional)</label>
                    <textarea
                      value={remoteFormPrivateKey}
                      onChange={(e) => setRemoteFormPrivateKey(e.target.value)}
                      placeholder="Paste private key here if you want to use a custom SSH key..."
                      rows={2}
                      className="w-full bg-[#2a2a2b] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded p-1.5 text-[10px] font-mono text-gray-200 placeholder-gray-500 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end space-x-2 text-xs pt-2">
              <button
                type="button"
                onClick={() => setShowRemoteModal(false)}
                className="px-3 py-1.5 hover:bg-[#2b2b2b] border border-[#3e3e3e] rounded text-gray-300 font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-[#2b2b2b] disabled:text-gray-500 rounded text-white font-semibold transition-colors"
              >
                Save & Connect
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
