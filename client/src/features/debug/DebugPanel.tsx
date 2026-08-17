import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { useDebugStore } from '../../shared/stores/useDebugStore';
import { 
  Play, StopCircle, Sliders, Trash, Plus, 
  ChevronRight, ChevronDown, Bug
} from 'lucide-react';

export default function DebugPanel() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspace?._id);
  const {
    status,
    launchConfigs,
    activeConfig,
    breakpoints,
    callStack,
    activeFrameId,
    scopes,
    variables,
    watches,
    fetchLaunchConfigs,
    saveLaunchConfig,
    setActiveConfig,
    fetchBreakpoints,
    toggleBreakpoint,
    removeBreakpoint,
    addWatch,
    removeWatch,
    startDebugging,
    stopDebugging,
    expandVariable
  } = useDebugStore();

  const [newWatchText, setNewWatchText] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  
  // Config form state
  const [configName, setConfigName] = useState('');
  const [configAdapter, setConfigAdapter] = useState<'node' | 'python'>('node');
  const [configProgram, setConfigProgram] = useState('');
  const [configArgs, setConfigArgs] = useState('');

  // Tree expansion cache
  const [expandedVars, setExpandedVars] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (workspaceId) {
      fetchLaunchConfigs(workspaceId);
      fetchBreakpoints(workspaceId);
    }
  }, [workspaceId]);

  const handleStartDebug = () => {
    if (workspaceId) {
      startDebugging(workspaceId);
    }
  };

  const handleStopDebug = () => {
    stopDebugging();
  };

  const handleAddWatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newWatchText.trim()) {
      addWatch(newWatchText.trim());
      setNewWatchText('');
    }
  };

  const handleSaveConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (workspaceId && configName && configProgram) {
      await saveLaunchConfig(workspaceId, {
        name: configName,
        adapterType: configAdapter,
        program: configProgram,
        args: configArgs ? configArgs.split(',').map(s => s.trim()) : [],
        env: {},
        mode: 'launch',
      });
      setShowConfigModal(false);
    }
  };

  const toggleVariableExpand = (ref: number) => {
    const isExpanded = !expandedVars[ref];
    setExpandedVars({ ...expandedVars, [ref]: isExpanded });
    if (isExpanded) {
      expandVariable(ref);
    }
  };

  const renderVariables = (ref: number, depth: number = 0) => {
    const vars = variables[ref] || [];
    if (vars.length === 0) return null;

    return (
      <div className="pl-3 border-l border-[#2d2d2d] space-y-1 mt-1 text-[11px] font-mono">
        {vars.map((v) => {
          const isExpandable = v.variablesReference > 0;
          const isExpanded = !!expandedVars[v.variablesReference];
          return (
            <div key={v.name} className="flex flex-col">
              <div 
                onClick={() => isExpandable && toggleVariableExpand(v.variablesReference)}
                className={`flex items-center space-x-1 py-0.5 rounded cursor-pointer ${
                  isExpandable ? 'hover:bg-[#252526] text-blue-300' : 'text-gray-300'
                }`}
              >
                {isExpandable && (
                  <span>
                    {isExpanded ? <ChevronDown size={10} className="text-gray-500" /> : <ChevronRight size={10} className="text-gray-500" />}
                  </span>
                )}
                <span className="font-semibold text-purple-400">{v.name}:</span>
                <span className="truncate max-w-[150px] text-green-400" title={v.value}>{v.value}</span>
              </div>
              {isExpandable && isExpanded && renderVariables(v.variablesReference, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-gray-300 select-none text-xs">
      {/* Session Header Status */}
      <div className="p-3 border-b border-[#2d2d2d] flex items-center justify-between bg-[#222222]">
        <div className="flex items-center space-x-2">
          <Bug size={14} className={status !== 'stopped' ? 'text-red-500 animate-pulse' : 'text-gray-400'} />
          <span className="font-bold text-gray-200">RUN & DEBUG</span>
        </div>
        {status !== 'stopped' && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
            status === 'paused' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'
          }`}>
            {status}
          </span>
        )}
      </div>

      {/* Configurations Picker Panel */}
      <div className="p-3 border-b border-[#2d2d2d] space-y-2 bg-[#1b1b1c]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Launch Configuration</span>
          <button 
            onClick={() => setShowConfigModal(true)}
            className="p-1 hover:bg-[#2d2d2d] rounded text-gray-400 hover:text-white transition-colors"
            title="Add Configuration"
          >
            <Plus size={12} />
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={activeConfig?.name || ''}
            onChange={(e) => {
              const matched = launchConfigs.find((c) => c.name === e.target.value);
              if (matched) setActiveConfig(matched);
            }}
            className="flex-1 bg-[#252526] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded p-1 text-xs text-gray-200"
          >
            {launchConfigs.map((c) => (
              <option key={c.name} value={c.name}>{c.name} ({c.adapterType})</option>
            ))}
          </select>

          {status === 'stopped' ? (
            <button
              onClick={handleStartDebug}
              className="p-1.5 bg-green-600 hover:bg-green-700 rounded text-white shadow transition-colors flex items-center justify-center"
              title="Start Debugging (F5)"
            >
              <Play size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleStopDebug}
              className="p-1.5 bg-red-600 hover:bg-red-700 rounded text-white shadow transition-colors flex items-center justify-center"
              title="Stop Debugging"
            >
              <StopCircle size={13} fill="currentColor" />
            </button>
          )}
        </div>
      </div>

      {/* Main panels list */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
        {/* Variables scopes inspector */}
        <div>
          <div className="flex items-center justify-between px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1 border-b border-[#2d2d2d] pb-1">
            <span>Variables</span>
          </div>
          {status === 'paused' ? (
            <div className="space-y-2 pl-1">
              {scopes.map((scope) => (
                <div key={scope.name} className="flex flex-col">
                  <div className="font-semibold text-gray-400 flex items-center space-x-1">
                    <ChevronDown size={11} className="text-gray-500" />
                    <span>{scope.name} Scope</span>
                  </div>
                  {renderVariables(scope.variablesReference)}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 text-[10px] italic py-2">
              Not paused (pause at breakpoint to inspect)
            </div>
          )}
        </div>

        {/* Call Stack frames list */}
        <div>
          <div className="flex items-center justify-between px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1 border-b border-[#2d2d2d] pb-1">
            <span>Call Stack</span>
          </div>
          {status === 'paused' ? (
            <div className="space-y-0.5">
              {callStack.map((frame) => (
                <div
                  key={frame.id}
                  onClick={() => useDebugStore.getState().selectFrame(frame.id)}
                  className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors text-[11px] ${
                    activeFrameId === frame.id
                      ? 'bg-blue-600/20 text-white font-semibold border-l-2 border-blue-500'
                      : 'hover:bg-[#252526] text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="truncate max-w-[150px] font-mono">{frame.name}</span>
                  {frame.source && (
                    <span className="text-[9px] text-gray-500 truncate max-w-[90px]">
                      {frame.source.path.split('/').pop()}:{frame.line}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 text-[10px] italic py-2">
              No call stack available
            </div>
          )}
        </div>

        {/* Watch Expressions Panel */}
        <div>
          <div className="flex items-center justify-between px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1 border-b border-[#2d2d2d] pb-1">
            <span>Watch</span>
          </div>
          <form onSubmit={handleAddWatchSubmit} className="flex items-center space-x-1.5 mb-2 px-1">
            <input
              type="text"
              value={newWatchText}
              onChange={(e) => setNewWatchText(e.target.value)}
              placeholder="Add watch expression..."
              className="flex-1 bg-[#252526] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded px-1.5 py-0.5 text-[10px] text-gray-200"
            />
            <button
              type="submit"
              className="p-1 hover:bg-[#2b2b2c] text-gray-400 hover:text-white rounded border border-[#3e3e3e]"
            >
              <Plus size={10} />
            </button>
          </form>
          <div className="space-y-1">
            {watches.length === 0 ? (
              <div className="text-center text-gray-500 text-[10px] italic py-1">
                No watch expressions
              </div>
            ) : (
              watches.map((w) => (
                <div key={w.expression} className="flex items-center justify-between px-2 py-0.5 bg-[#252526]/40 hover:bg-[#252526]/80 rounded border border-[#2d2d30]">
                  <div className="flex items-center space-x-1 font-mono text-[11px] truncate">
                    <span className="text-purple-400 font-semibold">{w.expression}:</span>
                    <span className="text-green-400 truncate max-w-[120px]">{w.value}</span>
                  </div>
                  <button
                    onClick={() => removeWatch(w.expression)}
                    className="p-0.5 hover:bg-[#333] text-gray-500 hover:text-red-400 rounded transition-colors"
                  >
                    <Trash size={10} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Breakpoints Panel List */}
        <div>
          <div className="flex items-center justify-between px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider text-gray-400 mb-1 border-b border-[#2d2d2d] pb-1">
            <span>Breakpoints ({breakpoints.length})</span>
          </div>
          <div className="space-y-1">
            {breakpoints.length === 0 ? (
              <div className="text-center text-gray-500 text-[10px] italic py-2">
                No breakpoints set
              </div>
            ) : (
              breakpoints.map((bp, idx) => (
                <div key={idx} className="flex items-center justify-between px-2 py-1 bg-[#252526]/20 border border-[#2c2c2f] rounded">
                  <div className="flex items-center space-x-2 truncate">
                    <input
                      type="checkbox"
                      checked={bp.enabled}
                      onChange={() => toggleBreakpoint(workspaceId!, bp.filePath, bp.line)}
                      className="rounded border-[#3e3e3e] bg-[#1e1e1e] text-blue-600 focus:ring-0 w-3 h-3"
                    />
                    <span className="truncate max-w-[130px] font-mono text-[11px] text-gray-300">
                      {bp.filePath.split('/').pop()}:{bp.line}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    {(bp.condition || bp.logMessage) && (
                      <span className="px-1 text-[8px] bg-purple-950/40 text-purple-400 border border-purple-800/40 rounded font-bold font-mono">
                        {bp.logMessage ? 'LOG' : 'COND'}
                      </span>
                    )}
                    <button
                      onClick={() => removeBreakpoint(workspaceId!, bp.filePath, bp.line)}
                      className="p-0.5 hover:bg-[#333] text-gray-500 hover:text-red-400 rounded transition-colors"
                    >
                      <Trash size={10} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleSaveConfigSubmit} className="bg-[#1e1e1e] border border-[#2d2d2d] rounded-xl shadow-2xl w-full max-w-sm overflow-hidden text-xs">
            <div className="px-4 py-3 bg-[#252526] border-b border-[#2d2d2d] font-bold text-gray-200 flex items-center space-x-1.5">
              <Sliders size={13} className="text-blue-400" />
              <span>Add Debug Configuration</span>
            </div>
            
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase font-semibold">Config Name</label>
                <input
                  type="text"
                  required
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  placeholder="e.g. Launch program.js"
                  className="w-full bg-[#252526] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded p-1.5 text-gray-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase font-semibold">Language Adapter</label>
                <select
                  value={configAdapter}
                  onChange={(e) => setConfigAdapter(e.target.value as any)}
                  className="w-full bg-[#252526] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded p-1.5 text-gray-200"
                >
                  <option value="node">Node.js (node)</option>
                  <option value="python">Python (python3)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase font-semibold">Program / Entry File</label>
                <input
                  type="text"
                  required
                  value={configProgram}
                  onChange={(e) => setConfigProgram(e.target.value)}
                  placeholder="e.g. index.js"
                  className="w-full bg-[#252526] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded p-1.5 text-gray-200"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-gray-400 uppercase font-semibold">Arguments (Comma-separated)</label>
                <input
                  type="text"
                  value={configArgs}
                  onChange={(e) => setConfigArgs(e.target.value)}
                  placeholder="e.g. --port=3000, --verbose"
                  className="w-full bg-[#252526] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded p-1.5 text-gray-200"
                />
              </div>
            </div>

            <div className="px-4 py-3 bg-[#252526] border-t border-[#2d2d2d] flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="px-3 py-1.5 hover:bg-[#323233] text-gray-400 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors"
              >
                Save Config
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
