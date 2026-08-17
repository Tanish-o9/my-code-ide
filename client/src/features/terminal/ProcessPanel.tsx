import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { api } from '../../shared/lib/api';
import { 
  RotateCw, 
  Trash2, 
  Loader2, 
  Cpu 
} from 'lucide-react';

interface ProcessItem {
  pid: number;
  name: string;
  cmd: string;
}

export default function ProcessPanel() {
  const { activeWorkspace } = useWorkspaceStore();
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [killingPid, setKillingPid] = useState<number | null>(null);

  const fetchProcesses = async () => {
    if (!activeWorkspace) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/workspaces/${activeWorkspace._id}/processes`);
      setProcesses(res.data);
    } catch (err) {
      console.error('[ProcessPanel] Failed to fetch process table:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProcesses();
    // Auto-refresh process list every 5 seconds
    const interval = setInterval(fetchProcesses, 5000);
    return () => clearInterval(interval);
  }, [activeWorkspace]);

  const handleKill = async (pid: number) => {
    if (!activeWorkspace) return;
    if (!confirm(`Are you sure you want to terminate process PID ${pid}?`)) return;

    setKillingPid(pid);
    try {
      await api.post(`/workspaces/${activeWorkspace._id}/processes/kill`, { pid });
      fetchProcesses();
    } catch (err) {
      console.error('[ProcessPanel] Failed to kill process:', err);
      alert('Failed to kill process');
    } finally {
      setKillingPid(null);
    }
  };

  if (!activeWorkspace) return null;

  return (
    <div className="w-full h-full flex flex-col bg-[#1e1e1e] text-xs text-gray-300">
      {/* Header controls */}
      <div className="flex items-center justify-between p-2 bg-[#252526] border-b border-[#3c3c3c] select-none flex-shrink-0">
        <div className="flex items-center space-x-1.5 font-semibold text-gray-400">
          <Cpu size={13} className="text-blue-400 animate-pulse" />
          <span>Active Workspace Container Processes</span>
        </div>
        <button
          onClick={fetchProcesses}
          disabled={isLoading}
          className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white cursor-pointer transition-colors flex items-center space-x-1"
          title="Force refresh list"
        >
          {isLoading ? <Loader2 size={12} className="animate-spin text-blue-500" /> : <RotateCw size={12} />}
          <span>Refresh</span>
        </button>
      </div>

      {/* Table viewports */}
      <div className="flex-1 overflow-y-auto">
        {processes.length > 0 ? (
          <table className="w-full text-left border-collapse select-text">
            <thead>
              <tr className="bg-[#252526]/40 text-gray-500 font-bold border-b border-[#3c3c3c]">
                <th className="py-2 px-3 w-16">PID</th>
                <th className="py-2 px-3 w-28">Name</th>
                <th className="py-2 px-3">Command / CommandLine</th>
                <th className="py-2 px-3 w-16 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((proc) => (
                <tr 
                  key={proc.pid} 
                  className="border-b border-[#3c3c3c]/30 hover:bg-[#2a2a2b]/35 transition-colors font-mono text-[10px]"
                >
                  <td className="py-2 px-3 font-semibold text-blue-400">{proc.pid}</td>
                  <td className="py-2 px-3 font-bold text-gray-200">{proc.name}</td>
                  <td className="py-2 px-3 text-gray-400 truncate max-w-sm" title={proc.cmd}>
                    {proc.cmd}
                  </td>
                  <td className="py-1 px-3 text-center">
                    <button
                      onClick={() => handleKill(proc.pid)}
                      disabled={killingPid === proc.pid}
                      className="p-1 bg-red-600/10 hover:bg-red-600/25 border border-red-500/20 text-red-400 rounded cursor-pointer transition-colors disabled:opacity-50"
                      title="Kill Process"
                    >
                      {killingPid === proc.pid ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500 italic">
            No running processes detected in container.
          </div>
        )}
      </div>
    </div>
  );
}
