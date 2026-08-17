import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { useUIStore } from '../../shared/stores/useUIStore';
import { 
  FolderOpen, 
  GitBranch, 
  FilePlus, 
  Settings, 
  Layout
} from 'lucide-react';

export default function WelcomeTab() {
  const { workspaces, setActiveWorkspace } = useWorkspaceStore();
  const { theme, setTheme } = useUIStore();

  return (
    <div className="w-full h-full bg-[#1e1e1e] text-gray-300 overflow-y-auto p-8 font-sans select-none">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mt-4">
        {/* Left Column: Get Started */}
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-light text-white tracking-wide">My Code IDE</h1>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              Welcome to your professional container-integrated coding sandbox.
            </p>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-200 tracking-wider uppercase text-[10px]">Start</h2>
            
            <button 
              onClick={() => useWorkspaceStore.getState().setShowCreateModal(true)}
              className="w-full flex items-center space-x-3 p-3 bg-[#252526] hover:bg-[#2d2d2e] rounded-lg border border-[#2d2d2d] transition-all text-left text-xs font-medium text-blue-400 group"
            >
              <FilePlus size={16} className="group-hover:scale-110 transition-transform text-blue-400" />
              <div>
                <span className="text-white block font-semibold">New Local Project</span>
                <span className="text-[10px] text-gray-500 block mt-0.5">Initialize a clean boilerplate directory</span>
              </div>
            </button>

            <button 
              onClick={() => useWorkspaceStore.getState().setShowCreateModal(true)}
              className="w-full flex items-center space-x-3 p-3 bg-[#252526] hover:bg-[#2d2d2e] rounded-lg border border-[#2d2d2d] transition-all text-left text-xs font-medium text-green-400 group"
            >
              <GitBranch size={16} className="group-hover:scale-110 transition-transform text-green-400" />
              <div>
                <span className="text-white block font-semibold">Clone Git Repository</span>
                <span className="text-[10px] text-gray-500 block mt-0.5">Checkout workspace from remote URL</span>
              </div>
            </button>
          </div>

          {/* Recent Workspaces list */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-200 tracking-wider uppercase text-[10px]">Recent Workspaces</h2>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2">
              {workspaces.length === 0 ? (
                <div className="p-3 bg-[#252526]/40 rounded border border-[#2d2d2d]/60 text-center text-xs text-gray-500 italic">
                  No recent workspaces found
                </div>
              ) : (
                workspaces.slice(0, 5).map((ws) => (
                  <div
                    key={ws._id}
                    onClick={() => setActiveWorkspace(ws)}
                    className="flex items-center justify-between p-2.5 bg-[#252526] hover:bg-[#2e2e30] border border-[#2d2d2d]/60 rounded-md cursor-pointer transition-colors text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <FolderOpen size={13} className="text-gray-400" />
                      <span className="font-semibold text-gray-300">{ws.name}</span>
                    </div>
                    <span className="text-[9px] font-mono bg-[#19191a] border border-[#2d2d2d] px-1.5 py-0.5 rounded text-gray-500 truncate max-w-[150px]">
                      {ws.templateUsed || 'node'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Reference & Theme */}
        <div className="space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-200 tracking-wider uppercase text-[10px]">Customize Theme</h2>
            <div className="flex space-x-2">
              <button 
                onClick={() => setTheme('dark')}
                className={`flex-1 p-2.5 rounded border text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                  theme === 'dark'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-lg'
                    : 'bg-[#252526] border-[#2d2d2d] text-gray-400 hover:text-white'
                }`}
              >
                <Layout size={13} />
                <span>Dark Mode</span>
              </button>
              <button 
                onClick={() => setTheme('light')}
                className={`flex-1 p-2.5 rounded border text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                  theme === 'light'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-lg'
                    : 'bg-[#252526] border-[#2d2d2d] text-gray-400 hover:text-white'
                }`}
              >
                <Layout size={13} />
                <span>Light Mode</span>
              </button>
            </div>
          </div>

          <div className="p-4 bg-[#252526] rounded-lg border border-[#2d2d2d] space-y-3">
            <h2 className="text-xs font-bold text-white tracking-wider flex items-center space-x-1.5">
              <Settings size={13} className="text-blue-400" />
              <span>Keyboard Shortcuts Cheat Sheet</span>
            </h2>
            <div className="text-[11px] space-y-2 font-mono">
              <div className="flex justify-between border-b border-[#2d2d2d]/60 pb-1.5">
                <span className="text-gray-400">Command Palette</span>
                <span className="bg-[#1e1e1e] px-1.5 py-0.5 rounded text-gray-300 border border-[#333]">Ctrl+Shift+P</span>
              </div>
              <div className="flex justify-between border-b border-[#2d2d2d]/60 pb-1.5">
                <span className="text-gray-400">Quick Open File</span>
                <span className="bg-[#1e1e1e] px-1.5 py-0.5 rounded text-gray-300 border border-[#333]">Ctrl+P</span>
              </div>
              <div className="flex justify-between border-b border-[#2d2d2d]/60 pb-1.5">
                <span className="text-gray-400">New Terminal Tab</span>
                <span className="bg-[#1e1e1e] px-1.5 py-0.5 rounded text-gray-300 border border-[#333]">Ctrl+Shift+`</span>
              </div>
              <div className="flex justify-between border-b border-[#2d2d2d]/60 pb-1.5">
                <span className="text-gray-400">Start Debugging</span>
                <span className="bg-[#1e1e1e] px-1.5 py-0.5 rounded text-gray-300 border border-[#333]">F5</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
