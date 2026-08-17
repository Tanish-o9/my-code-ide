import { useState, useEffect } from 'react';
import { useExtensionStore, type InstalledExtension } from '../../shared/stores/useExtensionStore';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { ToggleLeft, ToggleRight, Trash2, Settings, Save } from 'lucide-react';

export default function InstalledExtensionsPanel() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspace?._id);
  const {
    installedExtensions,
    fetchInstalledExtensions,
    toggleExtension,
    uninstallExtension,
    updateExtensionSettings
  } = useExtensionStore();

  const [expandedSettingsId, setExpandedSettingsId] = useState<string | null>(null);
  const [localSettings, setLocalSettings] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchInstalledExtensions();
  }, []);

  const handleToggle = async (ext: InstalledExtension) => {
    if (workspaceId) {
      await toggleExtension(ext._id, !ext.active, workspaceId);
    }
  };

  const handleUninstall = async (ext: InstalledExtension) => {
    if (workspaceId && confirm(`Are you sure you want to uninstall ${ext.manifest.name}?`)) {
      await uninstallExtension(ext._id, workspaceId);
    }
  };

  const openSettings = (ext: InstalledExtension) => {
    if (expandedSettingsId === ext._id) {
      setExpandedSettingsId(null);
    } else {
      setExpandedSettingsId(ext._id);
      setLocalSettings(ext.settings || {});
    }
  };

  const handleSettingChange = (key: string, value: any) => {
    setLocalSettings({ ...localSettings, [key]: value });
  };

  const saveSettings = async (ext: InstalledExtension) => {
    await updateExtensionSettings(ext._id, localSettings);
    alert('Settings saved successfully!');
    setExpandedSettingsId(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-gray-300 text-xs p-3 space-y-3 overflow-y-auto">
      <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
        Installed Extensions ({installedExtensions.length})
      </div>

      {installedExtensions.length === 0 ? (
        <div className="text-center text-gray-500 italic py-8 bg-[#252526]/30 border border-[#2d2d2d] rounded-lg">
          No extensions installed. Browse the Marketplace to download plugins.
        </div>
      ) : (
        <div className="space-y-2">
          {installedExtensions.map((ext) => {
            const hasSettings = ext.manifest.settingsSchema && Object.keys(ext.manifest.settingsSchema).length > 0;
            const isExpanded = expandedSettingsId === ext._id;

            return (
              <div 
                key={ext._id} 
                className={`p-3 bg-[#252526]/40 border border-[#2d2d2d] rounded-lg transition-all ${
                  ext.active ? 'border-l-4 border-l-blue-500' : 'opacity-60'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-200">{ext.manifest.name}</h4>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      v{ext.manifest.version} | by {ext.manifest.publisher}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Toggle Activation (Module 97) */}
                    <button
                      onClick={() => handleToggle(ext)}
                      className="text-gray-400 hover:text-white transition-colors"
                      title={ext.active ? 'Disable Extension' : 'Enable Extension'}
                    >
                      {ext.active ? (
                        <ToggleRight className="text-blue-500" size={20} />
                      ) : (
                        <ToggleLeft className="text-gray-600" size={20} />
                      )}
                    </button>

                    {/* Settings Inspector Button (Module 100) */}
                    {hasSettings && ext.active && (
                      <button
                        onClick={() => openSettings(ext)}
                        className={`p-1 hover:bg-[#333] rounded transition-colors ${isExpanded ? 'text-blue-400' : 'text-gray-400'}`}
                        title="Configure Settings"
                      >
                        <Settings size={13} />
                      </button>
                    )}

                    {/* Uninstall Button */}
                    <button
                      onClick={() => handleUninstall(ext)}
                      className="p-1 hover:bg-[#333] text-gray-500 hover:text-red-400 rounded transition-colors"
                      title="Uninstall Extension"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-gray-400 mt-1.5 leading-relaxed">{ext.manifest.description}</p>

                {/* Capabilities list */}
                {ext.manifest.permissions && ext.manifest.permissions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {ext.manifest.permissions.map((perm) => (
                      <span key={perm} className="px-1 py-0.5 bg-[#2d2d2d] rounded text-[8px] font-mono text-purple-400">
                        {perm}
                      </span>
                    ))}
                  </div>
                )}

                {/* Settings Configuration contribution drawer (Module 100) */}
                {isExpanded && hasSettings && (
                  <div className="mt-3 pt-3 border-t border-[#2d2d2d] space-y-2 bg-[#1b1b1c] p-2.5 rounded-lg">
                    <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">
                      Settings Configuration
                    </span>
                    <div className="space-y-3">
                      {Object.entries(ext.manifest.settingsSchema || {}).map(([key, schema]) => {
                        const val = localSettings[key] !== undefined ? localSettings[key] : schema.default;
                        return (
                          <div key={key} className="space-y-1">
                            <label className="text-[10px] text-gray-400 font-semibold flex flex-col">
                              <span>{key}</span>
                              {schema.description && (
                                <span className="text-[8px] font-normal text-gray-500 mt-0.5">{schema.description}</span>
                              )}
                            </label>

                            {schema.type === 'boolean' ? (
                              <input
                                type="checkbox"
                                checked={!!val}
                                onChange={(e) => handleSettingChange(key, e.target.checked)}
                                className="rounded bg-[#252526] border-[#3e3e3e] text-blue-600 focus:ring-0 w-3.5 h-3.5"
                              />
                            ) : schema.type === 'number' ? (
                              <input
                                type="number"
                                value={val}
                                onChange={(e) => handleSettingChange(key, Number(e.target.value))}
                                className="w-full bg-[#252526] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded p-1 text-[11px] text-gray-200"
                              />
                            ) : (
                              <input
                                type="text"
                                value={val}
                                onChange={(e) => handleSettingChange(key, e.target.value)}
                                className="w-full bg-[#252526] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded p-1 text-[11px] text-gray-200"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => saveSettings(ext)}
                      className="w-full mt-2 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded flex items-center justify-center space-x-1 transition-colors"
                    >
                      <Save size={11} />
                      <span>Save Config</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
