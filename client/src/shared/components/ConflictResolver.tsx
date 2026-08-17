import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useGitStore } from '../stores/useGitStore';
import { AlertCircle, Check, GitMerge } from 'lucide-react';
import { api } from '../lib/api';

interface ConflictBlock {
  type: 'normal' | 'conflict';
  content?: string;
  ours?: string;
  theirs?: string;
}

interface ConflictResolverProps {
  filePath: string;
  onResolve: () => void;
}

export default function ConflictResolver({ filePath, onResolve }: ConflictResolverProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const { fetchStatus } = useGitStore();
  const workspaceId = activeWorkspace?._id || '';

  const [blocks, setBlocks] = useState<ConflictBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId && filePath) {
      loadConflicts();
    }
  }, [workspaceId, filePath]);

  const loadConflicts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/workspaces/${workspaceId}/git/conflicts/file`, {
        params: { path: filePath }
      });
      setBlocks(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load file conflicts');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveBlock = (index: number, choice: 'ours' | 'theirs' | 'both') => {
    setBlocks((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (target.type === 'conflict') {
        let content = '';
        if (choice === 'ours') content = target.ours || '';
        else if (choice === 'theirs') content = target.theirs || '';
        else content = (target.ours || '') + '\n' + (target.theirs || '');

        copy[index] = {
          type: 'normal',
          content,
        };
      }
      return copy;
    });
  };

  const handleSaveResolution = async () => {
    // Reconstruct entire file content
    const unresolvedCount = blocks.filter((b) => b.type === 'conflict').length;
    if (unresolvedCount > 0) return;

    setLoading(true);
    setError(null);
    try {
      const finalContent = blocks.map((b) => b.content || '').join('\n');
      await api.post(`/workspaces/${workspaceId}/git/conflicts/resolve`, {
        path: filePath,
        content: finalContent,
      });
      await fetchStatus(workspaceId);
      onResolve();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save conflict resolution');
    } finally {
      setLoading(false);
    }
  };

  const unresolvedBlocks = blocks.filter((b) => b.type === 'conflict');
  const hasUnresolved = unresolvedBlocks.length > 0;

  if (loading && blocks.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#141414] text-gray-400">
        <div className="w-8 h-8 border-4 border-t-blue-500 border-blue-500/10 rounded-full animate-spin mb-3"></div>
        <span className="text-xs">Parsing conflict markers...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#141414] text-gray-300 min-w-0">
      {/* Header toolbar */}
      <div className="p-3 border-b border-[#2d2d2d] bg-[#1e1e1e] flex items-center justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <GitMerge size={16} className="text-yellow-500 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-gray-200 truncate">{filePath.split('/').pop()}</span>
            <span className="text-[10px] text-gray-500 truncate">{filePath}</span>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 bg-[#2b2b2b] rounded-full text-yellow-400 font-semibold font-mono shrink-0">
          {hasUnresolved ? `${unresolvedBlocks.length} conflict(s) remaining` : 'All conflicts resolved!'}
        </span>
      </div>

      {/* Main conflict content lists */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-[11px] leading-relaxed">
        {error && (
          <div className="p-3 bg-red-950/20 border border-red-900/50 rounded flex items-start space-x-2 text-red-300">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {blocks.map((block, idx) => {
          if (block.type === 'normal') {
            return (
              <div key={idx} className="bg-transparent text-gray-400 whitespace-pre overflow-x-auto py-1 px-2 border-l-2 border-transparent">
                {block.content || ' '}
              </div>
            );
          }

          // Conflict Block View
          return (
            <div key={idx} className="border border-yellow-500/30 rounded-lg overflow-hidden bg-[#1a1a14] shadow-md my-2">
              <div className="bg-[#2a2a1b] px-3 py-1.5 border-b border-yellow-500/20 flex items-center justify-between">
                <span className="text-[10px] text-yellow-500 font-bold uppercase tracking-wider">Conflict Block #{idx + 1}</span>
                <div className="flex space-x-1.5">
                  <button
                    onClick={() => handleResolveBlock(idx, 'ours')}
                    className="px-2 py-0.5 bg-green-950/40 hover:bg-green-900/50 border border-green-800/40 rounded text-[10px] text-green-400 font-bold transition-colors"
                  >
                    Accept Ours
                  </button>
                  <button
                    onClick={() => handleResolveBlock(idx, 'theirs')}
                    className="px-2 py-0.5 bg-blue-950/40 hover:bg-blue-900/50 border border-blue-800/40 rounded text-[10px] text-blue-400 font-bold transition-colors"
                  >
                    Accept Theirs
                  </button>
                  <button
                    onClick={() => handleResolveBlock(idx, 'both')}
                    className="px-2 py-0.5 bg-purple-950/40 hover:bg-purple-900/50 border border-purple-800/40 rounded text-[10px] text-purple-400 font-bold transition-colors"
                  >
                    Accept Both
                  </button>
                </div>
              </div>

              {/* Side-by-side or stacked preview */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#2a2a2b]">
                {/* Ours */}
                <div className="flex flex-col min-w-0">
                  <div className="bg-green-950/20 px-3 py-1 border-b border-green-950/30 text-[10px] text-green-400 font-semibold">
                    Current Change (Ours)
                  </div>
                  <pre className="p-3 overflow-x-auto text-green-300 bg-green-950/5 min-h-[40px] whitespace-pre">
                    {block.ours || ' '}
                  </pre>
                </div>

                {/* Theirs */}
                <div className="flex flex-col min-w-0">
                  <div className="bg-blue-950/20 px-3 py-1 border-b border-blue-950/30 text-[10px] text-blue-400 font-semibold">
                    Incoming Change (Theirs)
                  </div>
                  <pre className="p-3 overflow-x-auto text-blue-300 bg-blue-950/5 min-h-[40px] whitespace-pre">
                    {block.theirs || ' '}
                  </pre>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Footer */}
      <div className="p-3 border-t border-[#2d2d2d] bg-[#1e1e1e] flex items-center justify-between">
        <span className="text-[10px] text-gray-500">
          Accepting changes resolves the markers in-memory. Save will write the file to disk and stage it.
        </span>
        <button
          onClick={handleSaveResolution}
          disabled={hasUnresolved || loading}
          className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-[#2b2b2b] disabled:text-gray-500 rounded text-xs text-white font-bold transition-colors shadow"
        >
          <Check size={13} />
          <span>Save & Stage Resolution</span>
        </button>
      </div>
    </div>
  );
}
