import { useState } from 'react';
import InstalledExtensionsPanel from './InstalledExtensionsPanel';
import MarketplacePanel from './MarketplacePanel';
import DependenciesPanel from '../execution/DependenciesPanel';
import { Blocks, ShoppingBag, Package } from 'lucide-react';

export default function ExtensionsPanel() {
  const [activeTab, setActiveTab] = useState<'installed' | 'marketplace' | 'dependencies'>('installed');

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-gray-300">
      {/* Sub-tabs switch panel */}
      <div className="flex border-b border-[#2d2d2d] bg-[#222222] select-none text-[11px] h-9">
        <button
          onClick={() => setActiveTab('installed')}
          className={`flex-1 flex items-center justify-center space-x-1.5 border-r border-[#2d2d2d] transition-colors ${
            activeTab === 'installed'
              ? 'bg-[#1e1e1e] text-white border-b-2 border-b-blue-500 font-bold'
              : 'text-gray-400 hover:bg-[#252526] hover:text-gray-200'
          }`}
        >
          <Blocks size={12} />
          <span>Installed</span>
        </button>
        <button
          onClick={() => setActiveTab('marketplace')}
          className={`flex-1 flex items-center justify-center space-x-1.5 border-r border-[#2d2d2d] transition-colors ${
            activeTab === 'marketplace'
              ? 'bg-[#1e1e1e] text-white border-b-2 border-b-blue-500 font-bold'
              : 'text-gray-400 hover:bg-[#252526] hover:text-gray-200'
          }`}
        >
          <ShoppingBag size={12} />
          <span>Marketplace</span>
        </button>
        <button
          onClick={() => setActiveTab('dependencies')}
          className={`flex-1 flex items-center justify-center space-x-1.5 transition-colors ${
            activeTab === 'dependencies'
              ? 'bg-[#1e1e1e] text-white border-b-2 border-b-blue-500 font-bold'
              : 'text-gray-400 hover:bg-[#252526] hover:text-gray-200'
          }`}
        >
          <Package size={12} />
          <span>Packages</span>
        </button>
      </div>

      {/* Main View Panel Routing */}
      <div className="flex-1 min-h-0">
        {activeTab === 'installed' && <InstalledExtensionsPanel />}
        {activeTab === 'marketplace' && <MarketplacePanel />}
        {activeTab === 'dependencies' && <DependenciesPanel />}
      </div>
    </div>
  );
}
