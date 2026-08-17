import { useState, useEffect } from 'react';
import { api } from '../../shared/lib/api';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { 
  Play, 
  StopCircle, 
  Trash2, 
  RefreshCw, 
  Layers, 
  Database, 
  Network, 
  Container, 
  Download, 
  FileCode, 
  Terminal, 
  TerminalSquare,
  Activity
} from 'lucide-react';

interface ContainerInfo {
  id: string;
  names: string;
  image: string;
  state: string;
  status: string;
  ports: string;
}

interface ImageInfo {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

interface VolumeInfo {
  name: string;
  driver: string;
  scope: string;
}

interface NetworkInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
}

export default function DockerPanel() {
  const { activeWorkspace } = useWorkspaceStore();
  
  const [activeSection, setActiveSection] = useState<'containers' | 'images' | 'volumes' | 'networks'>('containers');
  
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [logsModalContent, setLogsModalContent] = useState<string | null>(null);
  const [logsModalTitle, setLogsModalTitle] = useState<string>('');
  
  // Pull/Build forms
  const [pullImageName, setPullImageName] = useState('');
  const [buildTag, setBuildTag] = useState('');
  const [buildDockerfile, setBuildDockerfile] = useState('Dockerfile');
  
  // Compose status
  const [composeOutput, setComposeOutput] = useState<string | null>(null);

  useEffect(() => {
    if (activeWorkspace) {
      refreshData();
    }
  }, [activeWorkspace, activeSection]);

  const refreshData = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      if (activeSection === 'containers') {
        const res = await api.get(`/workspaces/${activeWorkspace._id}/docker/containers`);
        setContainers(res.data);
      } else if (activeSection === 'images') {
        const res = await api.get(`/workspaces/${activeWorkspace._id}/docker/images`);
        setImages(res.data);
      } else if (activeSection === 'volumes') {
        const res = await api.get(`/workspaces/${activeWorkspace._id}/docker/volumes`);
        setVolumes(res.data);
      } else if (activeSection === 'networks') {
        const res = await api.get(`/workspaces/${activeWorkspace._id}/docker/networks`);
        setNetworks(res.data);
      }
    } catch (err) {
      console.error('Failed to load Docker specs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleContainerControl = async (id: string, action: 'start' | 'stop' | 'restart' | 'delete') => {
    if (!activeWorkspace) return;
    try {
      await api.post(`/workspaces/${activeWorkspace._id}/docker/containers/${id}/control`, { action });
      refreshData();
    } catch (err: any) {
      alert(`Control failed: ${err.response?.data?.error || err.message}`);
    }
  };

  const showContainerLogs = async (id: string, name: string) => {
    if (!activeWorkspace) return;
    try {
      const res = await api.get(`/workspaces/${activeWorkspace._id}/docker/containers/${id}/logs`);
      setLogsModalTitle(name);
      setLogsModalContent(res.data.logs || 'No logs available.');
    } catch (err: any) {
      alert(`Failed to fetch logs: ${err.message}`);
    }
  };

  const handlePullImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !pullImageName.trim()) return;
    setLoading(true);
    try {
      await api.post(`/workspaces/${activeWorkspace._id}/docker/pull`, { imageName: pullImageName });
      alert(`Successfully triggered pull for ${pullImageName}`);
      setPullImageName('');
      if (activeSection === 'images') refreshData();
    } catch (err: any) {
      alert(`Pull failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleBuildImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !buildTag.trim()) return;
    setLoading(true);
    try {
      await api.post(`/workspaces/${activeWorkspace._id}/docker/build`, { 
        tag: buildTag, 
        dockerfilePath: buildDockerfile 
      });
      alert(`Docker build triggered in background for ${buildTag}`);
      setBuildTag('');
    } catch (err: any) {
      alert(`Build failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCompose = async (action: 'up' | 'down') => {
    if (!activeWorkspace) return;
    setLoading(true);
    setComposeOutput(`Triggering docker compose ${action}...`);
    try {
      const res = await api.post(`/workspaces/${activeWorkspace._id}/docker/compose`, { action });
      setComposeOutput(res.data.message || `Compose ${action} initiated.`);
      setTimeout(() => setComposeOutput(null), 5000);
    } catch (err: any) {
      setComposeOutput(`Compose failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-gray-300 text-xs">
      {/* Docker Section Header Sub-Tabs */}
      <div className="flex border-b border-[#2d2d2d] bg-[#222222] select-none text-[10px] h-8">
        {(['containers', 'images', 'volumes', 'networks'] as const).map((sec) => (
          <button
            key={sec}
            onClick={() => setActiveSection(sec)}
            className={`flex-1 flex items-center justify-center space-x-1.5 transition-colors border-r border-[#2d2d2d] ${
              activeSection === sec
                ? 'bg-[#1e1e1e] text-white border-b-2 border-b-blue-500 font-bold'
                : 'text-gray-400 hover:bg-[#252526] hover:text-gray-200'
            }`}
          >
            {sec === 'containers' && <Container size={10} />}
            {sec === 'images' && <FileCode size={10} />}
            {sec === 'volumes' && <Database size={10} />}
            {sec === 'networks' && <Network size={10} />}
            <span className="capitalize">{sec}</span>
          </button>
        ))}
        <button
          onClick={refreshData}
          disabled={loading}
          className="px-2.5 text-gray-400 hover:text-white border-b border-[#2d2d2d] hover:bg-[#252526] disabled:opacity-50"
          title="Refresh Docker Specs"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Docker Compose Actions Quickbar */}
      <div className="p-2 bg-[#252526]/50 border-b border-[#2d2d2d] flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-400 flex items-center space-x-1">
          <Layers size={11} className="text-blue-400" />
          <span>Docker Compose</span>
        </span>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => handleCompose('up')}
            className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px]"
          >
            Compose Up
          </button>
          <button
            onClick={() => handleCompose('down')}
            className="px-2 py-0.5 bg-[#333] hover:bg-[#444] text-gray-300 rounded text-[10px]"
          >
            Compose Down
          </button>
        </div>
      </div>

      {composeOutput && (
        <div className="p-2 bg-[#2d2d30] text-yellow-400 font-mono text-[9px] border-b border-[#2d2d2d] whitespace-pre-wrap">
          {composeOutput}
        </div>
      )}

      {/* Main List Layout */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        
        {/* SECTION 1: CONTAINERS */}
        {activeSection === 'containers' && (
          <div className="space-y-2">
            {containers.length === 0 ? (
              <div className="text-center text-gray-500 italic py-8">No containers found.</div>
            ) : (
              containers.map((ct) => {
                const isRunning = ct.state === 'running';
                return (
                  <div key={ct.id} className="p-2.5 rounded bg-[#252526] border border-[#2d2d2d] flex flex-col space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-gray-200 truncate max-w-[130px]" title={ct.names}>
                        {ct.names}
                      </div>
                      <span className={`px-1 rounded text-[8px] font-bold ${
                        isRunning ? 'bg-green-950 text-green-400' : 'bg-red-950/40 text-red-500'
                      }`}>
                        {ct.state.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-[10px] text-gray-400 space-y-0.5">
                      <div className="truncate">Image: <code className="text-purple-400 font-mono">{ct.image}</code></div>
                      {ct.ports && <div className="truncate">Ports: {ct.ports}</div>}
                      <div className="text-gray-500">Status: {ct.status}</div>
                    </div>

                    <div className="flex items-center justify-between border-t border-[#2d2d2d]/60 pt-2 mt-1">
                      <button
                        onClick={() => showContainerLogs(ct.id, ct.names)}
                        className="text-blue-400 hover:text-blue-300 font-medium flex items-center space-x-1 text-[9px]"
                      >
                        <Terminal size={10} />
                        <span>Logs</span>
                      </button>
                      
                      <div className="flex items-center space-x-1.5">
                        {isRunning ? (
                          <button
                            onClick={() => handleContainerControl(ct.id, 'stop')}
                            className="p-1 hover:bg-[#323233] text-red-400 rounded"
                            title="Stop Container"
                          >
                            <StopCircle size={12} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleContainerControl(ct.id, 'start')}
                            className="p-1 hover:bg-[#323233] text-green-400 rounded"
                            title="Start Container"
                          >
                            <Play size={12} fill="currentColor" />
                          </button>
                        )}
                        <button
                          onClick={() => handleContainerControl(ct.id, 'restart')}
                          className="p-1 hover:bg-[#323233] text-yellow-500 rounded"
                          title="Restart Container"
                        >
                          <RefreshCw size={11} />
                        </button>
                        <button
                          onClick={() => handleContainerControl(ct.id, 'delete')}
                          className="p-1 hover:bg-[#323233] text-gray-400 hover:text-red-400 rounded"
                          title="Delete Container (Force)"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* SECTION 2: IMAGES */}
        {activeSection === 'images' && (
          <div className="space-y-3">
            {/* Pull Image form */}
            <form onSubmit={handlePullImage} className="p-2.5 rounded bg-[#252526] border border-[#2d2d2d] space-y-2">
              <span className="font-semibold text-gray-200">Pull Image</span>
              <div className="flex space-x-1.5">
                <input
                  type="text"
                  placeholder="e.g. node:latest or alpine"
                  value={pullImageName}
                  onChange={(e) => setPullImageName(e.target.value)}
                  className="flex-1 bg-[#1e1e1e] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded px-2 py-1 text-[11px]"
                />
                <button
                  type="submit"
                  className="px-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center justify-center"
                >
                  <Download size={12} />
                </button>
              </div>
            </form>

            {/* Build Image form */}
            <form onSubmit={handleBuildImage} className="p-2.5 rounded bg-[#252526] border border-[#2d2d2d] space-y-2">
              <span className="font-semibold text-gray-200">Build from Dockerfile</span>
              <div className="space-y-1.5 text-[10px]">
                <input
                  type="text"
                  placeholder="Tag name (e.g. my-app:1.0)"
                  value={buildTag}
                  onChange={(e) => setBuildTag(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded px-2 py-1 text-[11px]"
                />
                <input
                  type="text"
                  placeholder="Dockerfile path (default Dockerfile)"
                  value={buildDockerfile}
                  onChange={(e) => setBuildDockerfile(e.target.value)}
                  className="w-full bg-[#1e1e1e] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded px-2 py-1 text-[11px]"
                />
                <button
                  type="submit"
                  className="w-full py-1 bg-purple-700 hover:bg-purple-800 text-white rounded font-medium transition-colors text-[10px]"
                >
                  Trigger Docker Build
                </button>
              </div>
            </form>

            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Local Images</span>
              {images.length === 0 ? (
                <div className="text-center text-gray-500 italic py-4">No local images found.</div>
              ) : (
                images.map((img) => (
                  <div key={img.id} className="p-2 rounded bg-[#252526] border border-[#2d2d2d]/60 text-[10px] space-y-0.5">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-gray-200 truncate max-w-[130px]">{img.repository}</div>
                      <span className="text-gray-400 font-mono">v{img.tag}</span>
                    </div>
                    <div className="text-gray-400 flex items-center justify-between">
                      <span>Size: {img.size}</span>
                      <span className="text-[9px] text-gray-500">ID: {img.id.slice(0, 12)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* SECTION 3: VOLUMES */}
        {activeSection === 'volumes' && (
          <div className="space-y-2">
            {volumes.length === 0 ? (
              <div className="text-center text-gray-500 italic py-8">No volumes found.</div>
            ) : (
              volumes.map((vl) => (
                <div key={vl.name} className="p-2 rounded bg-[#252526] border border-[#2d2d2d] space-y-1">
                  <div className="font-semibold text-gray-200 truncate" title={vl.name}>
                    {vl.name}
                  </div>
                  <div className="text-gray-500 flex justify-between text-[10px]">
                    <span>Driver: {vl.driver}</span>
                    <span>Scope: {vl.scope}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* SECTION 4: NETWORKS */}
        {activeSection === 'networks' && (
          <div className="space-y-2">
            {networks.length === 0 ? (
              <div className="text-center text-gray-500 italic py-8">No networks found.</div>
            ) : (
              networks.map((nt) => (
                <div key={nt.id} className="p-2 rounded bg-[#252526] border border-[#2d2d2d] space-y-1">
                  <div className="font-semibold text-gray-200 flex justify-between">
                    <span className="truncate">{nt.name}</span>
                    <span className="text-purple-400 font-mono text-[9px]">{nt.driver}</span>
                  </div>
                  <div className="text-gray-500 flex justify-between text-[9px]">
                    <span>ID: {nt.id.slice(0, 12)}</span>
                    <span>Scope: {nt.scope}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </div>

      {/* Logs View Modal Panel Overlay */}
      {logsModalContent && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e1e1e] border border-[#3c3c3c] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[400px]">
            <div className="px-4 py-3 bg-[#252526] border-b border-[#3c3c3c] font-bold text-gray-200 flex items-center justify-between text-xs">
              <span className="flex items-center space-x-1.5">
                <Activity size={14} className="text-blue-400" />
                <span>Logs: {logsModalTitle}</span>
              </span>
              <button
                onClick={() => setLogsModalContent(null)}
                className="px-2 py-0.5 hover:bg-[#333] rounded text-gray-400 hover:text-white"
              >
                Close
              </button>
            </div>
            
            <div className="flex-1 min-h-0 p-4 bg-[#181819] overflow-y-auto">
              <pre className="text-[10px] text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">
                {logsModalContent}
              </pre>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
