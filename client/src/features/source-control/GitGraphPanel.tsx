import React, { useEffect, useState, useRef } from 'react';
import { useGitStore } from '../../shared/stores/useGitStore';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { GitCommit, GitBranch, RefreshCw, Undo, Play } from 'lucide-react';

interface CommitNode {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  date: string;
  message: string;
  refs: string;
  column: number;
}

export default function GitGraphPanel() {
  const { activeWorkspace } = useWorkspaceStore();
  const { history, fetchHistory, rebase, cherryPick } = useGitStore();
  const [nodes, setNodes] = useState<CommitNode[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<CommitNode | null>(null);
  const [rebaseTarget, setRebaseTarget] = useState('');
  const [loading, setLoading] = useState(false);

  const workspaceId = activeWorkspace?._id || '';

  const loadGraph = async () => {
    if (!workspaceId) return;
    setLoading(true);
    await fetchHistory(workspaceId);
    setLoading(false);
  };

  useEffect(() => {
    loadGraph();
  }, [workspaceId]);

  useEffect(() => {
    if (!history || history.length === 0) {
      setNodes([]);
      return;
    }

    // Assign columns to draw graph lines
    const processedNodes: CommitNode[] = [];
    const activeBranches: string[] = []; // Tracks hashes of active branch heads/parents

    history.forEach((c: any) => {
      // Find or assign column for this commit
      let column = 0;
      const index = activeBranches.indexOf(c.hash);

      if (index !== -1) {
        column = index;
        // Replace this commit with its first parent
        if (c.parents && c.parents.length > 0) {
          activeBranches[index] = c.parents[0];
          // Add extra parents to other columns
          for (let p = 1; p < c.parents.length; p++) {
            activeBranches.push(c.parents[p]);
          }
        } else {
          activeBranches.splice(index, 1);
        }
      } else {
        column = activeBranches.length;
        if (c.parents && c.parents.length > 0) {
          activeBranches.push(c.parents[0]);
          for (let p = 1; p < c.parents.length; p++) {
            activeBranches.push(c.parents[p]);
          }
        }
      }

      processedNodes.push({
        ...c,
        column
      });
    });

    setNodes(processedNodes);
  }, [history]);

  const handleCherryPick = async (hash: string) => {
    if (!confirm(`Are you sure you want to cherry-pick commit ${hash.substring(0, 7)}?`)) return;
    const res = await cherryPick(workspaceId, hash);
    if (res.success) {
      alert('Cherry-pick completed successfully.');
      loadGraph();
    } else {
      alert(`Cherry-pick failed:\n${res.stderr || 'Merge conflicts occurred.'}`);
    }
  };

  const handleRebase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rebaseTarget.trim()) return;
    if (!confirm(`Are you sure you want to rebase current branch onto ${rebaseTarget}?`)) return;
    
    const res = await rebase(workspaceId, rebaseTarget.trim());
    if (res.success) {
      alert('Rebase completed successfully.');
      setRebaseTarget('');
      loadGraph();
    } else {
      alert(`Rebase failed:\n${res.stderr || 'Merge conflicts occurred.'}`);
    }
  };

  // Render connecting lines between commit nodes
  const renderLines = () => {
    const lines: JSX.Element[] = [];
    const rowHeight = 36;
    const colWidth = 16;
    const radius = 4;

    nodes.forEach((node, i) => {
      // Find where parents are in the nodes list to draw lines to them
      node.parents.forEach((parentHash) => {
        const parentIndex = nodes.findIndex((n) => n.hash === parentHash);
        if (parentIndex !== -1) {
          const parentNode = nodes[parentIndex];
          const x1 = node.column * colWidth + 12;
          const y1 = i * rowHeight + rowHeight / 2;
          const x2 = parentNode.column * colWidth + 12;
          const y2 = parentIndex * rowHeight + rowHeight / 2;

          // Multi-color branches
          const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444'];
          const strokeColor = colors[node.column % colors.length];

          // Draw bezier curve for branches merging/splitting
          const pathD = `M ${x1} ${y1} C ${x1} ${y1 + rowHeight / 2}, ${x2} ${y2 - rowHeight / 2}, ${x2} ${y2}`;

          lines.push(
            <path
              key={`${node.hash}-${parentHash}`}
              d={pathD}
              stroke={strokeColor}
              strokeWidth={2}
              fill="none"
              opacity={0.8}
            />
          );
        }
      });
    });

    return lines;
  };

  return (
    <div className="w-full h-full flex bg-[#1e1e1e] text-xs font-sans text-gray-300">
      {/* Commits Graph List */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-[#2d2d2d] h-full">
        {/* Toolbar */}
        <div className="h-9 border-b border-[#2d2d2d] flex items-center justify-between px-3 shrink-0 bg-[#222222]">
          <span className="font-semibold text-gray-200 flex items-center space-x-1.5">
            <GitBranch size={13} className="text-blue-400" />
            <span>Git Log Graph</span>
          </span>
          <button
            onClick={loadGraph}
            className="p-1 hover:bg-[#2d2d2d] rounded transition-colors text-gray-400 hover:text-white"
            title="Refresh Graph"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Git log scrollable list */}
        <div className="flex-1 overflow-auto relative">
          {nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-2">
              <GitCommit size={32} className="text-gray-600" />
              <span>No commits found. Make your first commit to see the graph!</span>
            </div>
          ) : (
            <div className="relative" style={{ height: nodes.length * 36 }}>
              {/* SVG Canvas overlay background */}
              <svg 
                className="absolute inset-y-0 left-0 pointer-events-none z-0" 
                style={{ width: Math.max(...nodes.map(n => n.column), 0) * 16 + 32, height: nodes.length * 36 }}
              >
                {renderLines()}
                {/* Draw node dots */}
                {nodes.map((node, i) => {
                  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444'];
                  const fillColor = colors[node.column % colors.length];
                  return (
                    <circle
                      key={`dot-${node.hash}`}
                      cx={node.column * 16 + 12}
                      cy={i * 36 + 18}
                      r={4}
                      fill={fillColor}
                      stroke="#1e1e1e"
                      strokeWidth={1}
                    />
                  );
                })}
              </svg>

              {/* Rows aligned exactly with dots */}
              <div className="absolute inset-0 z-10">
                {nodes.map((node, i) => {
                  const paddingLeft = Math.max(...nodes.map(n => n.column), 0) * 16 + 32;
                  
                  // Parse refs (e.g. (HEAD -> main, origin/main) -> HEAD -> main, origin/main)
                  const cleanRefs = node.refs ? node.refs.replace(/[()]/g, '') : '';
                  const refItems = cleanRefs ? cleanRefs.split(', ') : [];

                  return (
                    <div
                      key={node.hash}
                      onClick={() => setSelectedCommit(node)}
                      className={`h-9 flex items-center px-2 cursor-pointer border-b border-[#2d2d2d]/30 select-none hover:bg-blue-500/5 ${
                        selectedCommit?.hash === node.hash ? 'bg-blue-500/10' : ''
                      }`}
                      style={{ paddingLeft }}
                    >
                      <div className="flex-1 min-w-0 flex items-center space-x-2">
                        {refItems.map((ref) => {
                          const isHead = ref.includes('HEAD');
                          const isRemote = ref.includes('origin');
                          const isTag = ref.includes('tag:');
                          let bg = 'bg-gray-800 border-gray-600 text-gray-400';
                          if (isHead) bg = 'bg-green-800/30 border-green-700/50 text-green-400';
                          else if (isRemote) bg = 'bg-red-800/30 border-red-700/50 text-red-400';
                          else if (isTag) bg = 'bg-yellow-800/30 border-yellow-700/50 text-yellow-400';
                          
                          return (
                            <span 
                              key={ref} 
                              className={`px-1 py-0.5 rounded text-[9px] border font-sans font-semibold shrink-0 uppercase tracking-wide ${bg}`}
                            >
                              {ref.replace('tag: ', '')}
                            </span>
                          );
                        })}
                        <span className="text-gray-100 font-medium truncate">{node.message}</span>
                      </div>
                      <div className="flex items-center space-x-4 text-[10px] text-gray-500 shrink-0 font-mono ml-4">
                        <span className="text-gray-400 truncate max-w-[80px]">{node.author}</span>
                        <span>{new Date(node.date).toLocaleDateString()}</span>
                        <span className="text-blue-500/60 font-semibold">{node.hash.substring(0, 7)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Commit Detail & Actions Panel */}
      <div className="w-80 flex flex-col h-full bg-[#1c1c1f]">
        <div className="h-9 border-b border-[#2d2d2d] flex items-center px-3 shrink-0 bg-[#222222]">
          <span className="font-semibold text-gray-200">Commit Details</span>
        </div>

        {selectedCommit ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-mono text-blue-400 select-all font-semibold">{selectedCommit.hash}</span>
                <span className="text-gray-500">{new Date(selectedCommit.date).toLocaleTimeString()}</span>
              </div>
              <h3 className="text-sm font-bold text-white leading-snug">{selectedCommit.message}</h3>
            </div>

            <div className="border-t border-[#2d2d2d] pt-3 space-y-2 text-[10px]">
              <div>
                <span className="text-gray-500 uppercase tracking-wider block">Author</span>
                <span className="text-gray-200 font-medium">{selectedCommit.author} ({selectedCommit.email})</span>
              </div>
              <div>
                <span className="text-gray-500 uppercase tracking-wider block">Date</span>
                <span className="text-gray-200 font-medium">{new Date(selectedCommit.date).toLocaleString()}</span>
              </div>
            </div>

            {/* Git Command Actions */}
            <div className="border-t border-[#2d2d2d] pt-3 space-y-2">
              <span className="text-gray-500 uppercase tracking-wider text-[9px] block">Actions</span>
              
              <button
                onClick={() => handleCherryPick(selectedCommit.hash)}
                className="w-full py-1.5 bg-[#2b2b2b] hover:bg-blue-600 hover:text-white rounded text-xs font-semibold text-gray-200 transition-colors flex items-center justify-center space-x-1.5"
              >
                <Undo size={12} />
                <span>Cherry-Pick Commit</span>
              </button>

              <form onSubmit={handleRebase} className="pt-2 space-y-1.5">
                <span className="text-gray-500 text-[9px]">REBASE ONTO BRANCH</span>
                <div className="flex space-x-1.5">
                  <input
                    type="text"
                    value={rebaseTarget}
                    onChange={(e) => setRebaseTarget(e.target.value)}
                    placeholder="Branch name (e.g. main)..."
                    className="flex-1 bg-[#141415] border border-[#2d2d2d] rounded px-2 py-1 text-xs outline-none focus:border-blue-500 text-gray-200 placeholder-gray-600"
                  />
                  <button
                    type="submit"
                    className="px-2.5 bg-blue-600 hover:bg-blue-700 rounded text-white font-semibold transition-colors flex items-center"
                    title="Run Rebase"
                  >
                    <Play size={11} />
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-500 space-y-2">
            <GitCommit size={24} className="text-gray-600" />
            <span>Select a commit in the graph to view details and execute cherry-picks or rebases</span>
          </div>
        )}
      </div>
    </div>
  );
}
