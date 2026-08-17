import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { api } from '../../shared/lib/api';
import { 
  Loader2, 
  Settings, 
  Sun, 
  Moon, 
  Plus, 
  Trash2, 
  EyeOff, 
  Play, 
  Layers 
} from 'lucide-react';

interface EnvVar {
  _id: string;
  key: string;
  value: string;
  isSecret: boolean;
}

interface RunConfig {
  _id: string;
  name: string;
  command: string;
}

export default function SettingsPanel() {
  const { activeWorkspace, setActiveWorkspace } = useWorkspaceStore();
  
  // General states
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'env' | 'run'>('editor');

  // Env states
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvVal, setNewEnvVal] = useState('');
  const [newEnvSecret, setNewEnvSecret] = useState(false);
  const [isLoadingEnv, setIsLoadingEnv] = useState(false);

  // RunConfig states
  const [runConfigs, setRunConfigs] = useState<RunConfig[]>([]);
  const [newRunName, setNewRunName] = useState('');
  const [newRunCmd, setNewRunCmd] = useState('');
  const [isLoadingRun, setIsLoadingRun] = useState(false);

  useEffect(() => {
    if (!activeWorkspace) return;
    if (activeTab === 'env') {
      fetchEnvVars();
    } else if (activeTab === 'run') {
      fetchRunConfigs();
    }
  }, [activeTab, activeWorkspace]);

  if (!activeWorkspace) return null;

  const currentSettings = activeWorkspace.settings || {
    theme: 'dark',
    fontSize: 12,
    tabSize: 2,
  };

  // -------------------------------------------------------------
  // REST API FETCHERS
  // -------------------------------------------------------------
  const fetchEnvVars = async () => {
    setIsLoadingEnv(true);
    try {
      const res = await api.get(`/workspaces/${activeWorkspace._id}/env`);
      setEnvVars(res.data);
    } catch (err) {
      console.error('[Settings/Env] Failed to fetch:', err);
    } finally {
      setIsLoadingEnv(false);
    }
  };

  const fetchRunConfigs = async () => {
    setIsLoadingRun(true);
    try {
      const res = await api.get(`/workspaces/${activeWorkspace._id}/runconfigs`);
      setRunConfigs(res.data);
    } catch (err) {
      console.error('[Settings/RunConfig] Failed to fetch:', err);
    } finally {
      setIsLoadingRun(false);
    }
  };

  // -------------------------------------------------------------
  // SAVE / DELETE ACTIONS
  // -------------------------------------------------------------
  const handleUpdateSetting = async (key: string, value: any) => {
    setIsUpdating(true);
    const updatedSettings = {
      ...currentSettings,
      [key]: value,
    };

    try {
      const res = await api.patch(`/workspaces/${activeWorkspace._id}/settings`, {
        settings: updatedSettings,
      });
      setActiveWorkspace(res.data);
    } catch (err) {
      console.error('[Settings] Failed to update workspace settings:', err);
      alert('Failed to save settings');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnvKey.trim() || !newEnvVal.trim()) return;

    setIsLoadingEnv(true);
    try {
      await api.post(`/workspaces/${activeWorkspace._id}/env`, {
        key: newEnvKey.trim(),
        value: newEnvVal,
        isSecret: newEnvSecret,
      });
      setNewEnvKey('');
      setNewEnvVal('');
      setNewEnvSecret(false);
      fetchEnvVars();
    } catch (err) {
      console.error('[Settings/Env] Add failed:', err);
    } finally {
      setIsLoadingEnv(false);
    }
  };

  const handleDeleteEnv = async (envId: string) => {
    setIsLoadingEnv(true);
    try {
      await api.delete(`/workspaces/${activeWorkspace._id}/env/${envId}`);
      fetchEnvVars();
    } catch (err) {
      console.error('[Settings/Env] Delete failed:', err);
    } finally {
      setIsLoadingEnv(false);
    }
  };

  const handleAddRunConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRunName.trim() || !newRunCmd.trim()) return;

    setIsLoadingRun(true);
    try {
      await api.post(`/workspaces/${activeWorkspace._id}/runconfigs`, {
        name: newRunName.trim(),
        command: newRunCmd.trim(),
      });
      setNewRunName('');
      setNewRunCmd('');
      fetchRunConfigs();
    } catch (err) {
      console.error('[Settings/RunConfig] Add failed:', err);
    } finally {
      setIsLoadingRun(false);
    }
  };

  const handleDeleteRunConfig = async (configId: string) => {
    setIsLoadingRun(true);
    try {
      await api.delete(`/workspaces/${activeWorkspace._id}/runconfigs/${configId}`);
      fetchRunConfigs();
    } catch (err) {
      console.error('[Settings/RunConfig] Delete failed:', err);
    } finally {
      setIsLoadingRun(false);
    }
  };

  return (
    <div className="h-full flex flex-col text-xs bg-[#252526]">
      {/* Settings Navigation Tabs */}
      <div className="flex border-b border-[#3c3c3c] bg-[#2d2d2d] flex-shrink-0 select-none">
        <button
          onClick={() => setActiveTab('editor')}
          className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'editor' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Editor
        </button>
        <button
          onClick={() => setActiveTab('env')}
          className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'env' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Env Variables
        </button>
        <button
          onClick={() => setActiveTab('run')}
          className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === 'run' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          Run Configs
        </button>
      </div>

      {/* Settings Viewport Panel */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        
        {/* ========================================================= */}
        {/* SUBSECTION: GENERAL EDITOR SETTINGS */}
        {/* ========================================================= */}
        {activeTab === 'editor' && (
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-gray-300 font-semibold border-b border-[#3c3c3c] pb-2">
              <Settings size={14} />
              <span>General Settings</span>
              {isUpdating && <Loader2 size={12} className="animate-spin text-blue-500 ml-auto" />}
            </div>

            {/* Theme selector */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-gray-500 uppercase">Color Theme</label>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleUpdateSetting('theme', 'dark')}
                  className={`flex-1 flex items-center justify-center space-x-2 py-1.5 rounded border transition-colors cursor-pointer ${
                    currentSettings.theme === 'dark'
                      ? 'bg-blue-600/20 border-blue-500 text-white font-medium'
                      : 'bg-[#1e1e1e] border-[#3c3c3c] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Moon size={12} />
                  <span>Dark Theme</span>
                </button>
                <button
                  onClick={() => handleUpdateSetting('theme', 'light')}
                  className={`flex-1 flex items-center justify-center space-x-2 py-1.5 rounded border transition-colors cursor-pointer ${
                    currentSettings.theme === 'light'
                      ? 'bg-blue-600/20 border-blue-500 text-white font-medium'
                      : 'bg-[#1e1e1e] border-[#3c3c3c] text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <Sun size={12} />
                  <span>Light Theme</span>
                </button>
              </div>
            </div>

            {/* Font Size selector */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-gray-500 uppercase">Editor Font Size</label>
              <select
                value={currentSettings.fontSize}
                onChange={(e) => handleUpdateSetting('fontSize', parseInt(e.target.value))}
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded p-1.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value={10}>10px</option>
                <option value={12}>12px</option>
                <option value={14}>14px</option>
                <option value={16}>16px</option>
                <option value={18}>18px</option>
                <option value={20}>20px</option>
              </select>
            </div>

            {/* Tab Size selector */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-gray-500 uppercase">Tab Size</label>
              <select
                value={currentSettings.tabSize}
                onChange={(e) => handleUpdateSetting('tabSize', parseInt(e.target.value))}
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded p-1.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
                <option value={8}>8 spaces</option>
              </select>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SUBSECTION: ENV VARS / SECRETS MANAGER */}
        {/* ========================================================= */}
        {activeTab === 'env' && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-gray-300 font-semibold border-b border-[#3c3c3c] pb-2">
              <Layers size={14} />
              <span>Environment Variables</span>
              {isLoadingEnv && <Loader2 size={12} className="animate-spin text-blue-500 ml-auto" />}
            </div>

            {/* Form to Add env */}
            <form onSubmit={handleAddEnv} className="space-y-2 bg-[#1e1e1e] p-2.5 rounded border border-[#3c3c3c]">
              <input
                type="text"
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value)}
                placeholder="Variable Key (e.g. PORT)"
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-white"
                required
              />
              <input
                type="text"
                value={newEnvVal}
                onChange={(e) => setNewEnvVal(e.target.value)}
                placeholder="Variable Value"
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-white"
                required
              />
              
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-1.5 text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newEnvSecret}
                    onChange={(e) => setNewEnvSecret(e.target.checked)}
                    className="rounded bg-[#252526] border-[#3c3c3c] text-blue-600 focus:ring-0"
                  />
                  <EyeOff size={11} />
                  <span>Encrypt at rest (Secret)</span>
                </label>
                
                <button
                  type="submit"
                  disabled={isLoadingEnv}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white flex items-center space-x-1 cursor-pointer font-semibold"
                >
                  <Plus size={12} />
                  <span>Add</span>
                </button>
              </div>
            </form>

            {/* List Env Vars */}
            <div className="space-y-1.5">
              {envVars.length > 0 ? (
                envVars.map((env) => (
                  <div 
                    key={env._id} 
                    className="flex items-center justify-between p-2 rounded bg-[#1e1e1e] border border-[#3c3c3c]"
                  >
                    <div className="truncate flex-1 pr-2">
                      <span className="font-bold text-blue-400">{env.key}</span>
                      <span className="text-gray-500 mx-1.5">=</span>
                      <span className="font-mono text-gray-300">{env.value}</span>
                    </div>
                    {env.isSecret && (
                      <span className="text-[9px] bg-purple-900/40 text-purple-300 px-1 rounded mr-2 flex-shrink-0 flex items-center space-x-0.5">
                        <EyeOff size={9} />
                        <span>Secret</span>
                      </span>
                    )}
                    <button
                      onClick={() => handleDeleteEnv(env._id)}
                      className="p-1 hover:bg-[#333] rounded text-gray-500 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-6 italic">No custom variables configured.</div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SUBSECTION: RUN CONFIGURATION PROFILES */}
        {/* ========================================================= */}
        {activeTab === 'run' && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-gray-300 font-semibold border-b border-[#3c3c3c] pb-2">
              <Play size={14} />
              <span>Run Configurations</span>
              {isLoadingRun && <Loader2 size={12} className="animate-spin text-blue-500 ml-auto" />}
            </div>

            {/* Form to Add RunConfig */}
            <form onSubmit={handleAddRunConfig} className="space-y-2 bg-[#1e1e1e] p-2.5 rounded border border-[#3c3c3c]">
              <input
                type="text"
                value={newRunName}
                onChange={(e) => setNewRunName(e.target.value)}
                placeholder="Profile Name (e.g. Server Dev)"
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-white"
                required
              />
              <input
                type="text"
                value={newRunCmd}
                onChange={(e) => setNewRunCmd(e.target.value)}
                placeholder="Command (e.g. npm start)"
                className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-2 py-1 text-white"
                required
              />
              
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isLoadingRun}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white flex items-center space-x-1 cursor-pointer font-semibold"
                >
                  <Plus size={12} />
                  <span>Create Profile</span>
                </button>
              </div>
            </form>

            {/* List RunConfigs */}
            <div className="space-y-1.5">
              {runConfigs.length > 0 ? (
                runConfigs.map((config) => (
                  <div 
                    key={config._id} 
                    className="flex items-center justify-between p-2 rounded bg-[#1e1e1e] border border-[#3c3c3c]"
                  >
                    <div className="truncate flex-1 pr-2">
                      <span className="font-bold text-green-400">{config.name}</span>
                      <div className="text-[10px] text-gray-500 font-mono truncate mt-0.5">{config.command}</div>
                    </div>
                    <button
                      onClick={() => handleDeleteRunConfig(config._id)}
                      className="p-1 hover:bg-[#333] rounded text-gray-500 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-6 italic">No profiles configured.</div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
