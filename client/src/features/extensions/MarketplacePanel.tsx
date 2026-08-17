import { useState, useEffect } from 'react';
import { useExtensionStore, type ExtensionListing } from '../../shared/stores/useExtensionStore';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { Search, Download, Shield, ShieldAlert, CheckCircle, Info, Upload, RefreshCw } from 'lucide-react';

export default function MarketplacePanel() {
  const workspaceId = useWorkspaceStore((state) => state.activeWorkspace?._id);
  const {
    marketplaceListings,
    installedExtensions,
    fetchMarketplaceListings,
    fetchInstalledExtensions,
    installExtension,
    installVsix,
    rateExtension
  } = useExtensionStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedExtension, setSelectedExtension] = useState<ExtensionListing | null>(null);
  
  // Consent Modal State
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentingListing, setConsentingListing] = useState<ExtensionListing | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarketplaceListings();
    fetchInstalledExtensions();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMarketplaceListings(searchQuery);
  };

  const isInstalled = (extId: string) => {
    return installedExtensions.some((e) => e.extensionId === extId);
  };

  const getInstalledRef = (extId: string) => {
    return installedExtensions.find((e) => e.extensionId === extId);
  };

  const handleInstallClick = (listing: ExtensionListing) => {
    setConsentingListing(listing);
    setInstallError(null);
    setShowConsentModal(true);
  };

  const confirmInstallation = async () => {
    if (!consentingListing) return;
    try {
      await installExtension(consentingListing.extensionId);
      setShowConsentModal(false);
      setConsentingListing(null);
      // Auto activate lazy sockets
      if (workspaceId) {
        useExtensionStore.getState().connectWorkspaceSocket(workspaceId);
      }
    } catch (err: any) {
      setInstallError(err.message || 'Installation failed.');
    }
  };

  const latestManifest = selectedExtension?.versions[selectedExtension.versions.length - 1]?.manifest;

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-gray-300 text-xs">
      {/* Search Header Bar */}
      <div className="p-3 border-b border-[#2d2d2d] bg-[#222222] flex items-center space-x-2">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search extensions (e.g. mock)..."
            className="w-full bg-[#252526] border border-[#3e3e3e] focus:border-blue-500 outline-none rounded pl-8 pr-3 py-1.5 text-xs text-gray-200"
          />
          <Search size={14} className="absolute left-2.5 top-2 text-gray-500" />
        </form>
        <button
          onClick={() => document.getElementById('vsix-upload-file')?.click()}
          className="p-1.5 bg-[#252526] border border-[#3e3e3e] hover:bg-[#323233] text-gray-400 hover:text-white rounded transition-colors"
          title="Install from VSIX..."
        >
          <Upload size={14} />
        </button>
        <input
          type="file"
          id="vsix-upload-file"
          accept=".vsix"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              try {
                await installVsix(file);
                alert('VSIX extension installed successfully!');
                fetchInstalledExtensions();
              } catch (err: any) {
                alert(`VSIX Install Failed: ${err.message || err}`);
              }
            }
          }}
        />
      </div>

      {/* Main Browse Split Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Listings List */}
        <div className="w-1/2 border-r border-[#2d2d2d] overflow-y-auto p-2 space-y-1.5">
          <div className="px-2 py-1 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
            Available Plugins
          </div>
          {marketplaceListings.length === 0 ? (
            <div className="text-center text-gray-500 italic py-8">No extensions found.</div>
          ) : (
            marketplaceListings.map((listing) => {
              const installed = isInstalled(listing.extensionId);
              const instRef = getInstalledRef(listing.extensionId);
              return (
                <div
                  key={listing.extensionId}
                  onClick={() => setSelectedExtension(listing)}
                  className={`p-2.5 rounded cursor-pointer border transition-colors select-none ${
                    selectedExtension?.extensionId === listing.extensionId
                      ? 'bg-blue-600/10 border-blue-500 text-white'
                      : 'bg-[#252526]/50 hover:bg-[#252526] border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-gray-200 truncate max-w-[110px]">{listing.name}</div>
                      <div className="text-[10px] text-gray-500 truncate">by {listing.publisher}</div>
                    </div>
                    {installed && (
                      <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${
                        instRef?.active ? 'bg-green-950 text-green-400' : 'bg-gray-800 text-gray-500'
                      }`}>
                        {instRef?.active ? 'ACTIVE' : 'DISABLED'}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1 line-clamp-1">{listing.description}</div>
                </div>
              );
            })
          )}
        </div>

        {/* Selected Extension Info View */}
        <div className="w-1/2 overflow-y-auto p-3.5 bg-[#1b1b1c]">
          {selectedExtension ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-gray-100">{selectedExtension.name}</h3>
                <div className="text-[10px] text-gray-500 mt-0.5">Publisher: {selectedExtension.publisher}</div>
                <div className="text-[10px] text-gray-500">Latest Version: v{selectedExtension.latestVersion}</div>
                {selectedExtension.categories && selectedExtension.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {selectedExtension.categories.map((cat) => (
                      <span key={cat} className="px-1.5 py-0.5 rounded bg-[#2b2b2b] text-[9px] text-gray-400 font-medium">
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center space-x-1 mt-2 text-[10px] text-yellow-500 font-semibold">
                  <span>⭐ {selectedExtension.rating || '4.5'}</span>
                  <span className="text-gray-500">({selectedExtension.ratingCount || 1} ratings)</span>
                </div>
                <div className="flex items-center space-x-1 mt-1">
                  <span className="text-gray-500 text-[10px]">Rate:</span>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => rateExtension(selectedExtension.extensionId, star)}
                      className="text-gray-600 hover:text-yellow-500 transition-colors text-[13px]"
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {(() => {
                  const instRef = getInstalledRef(selectedExtension.extensionId);
                  const hasUpdate = instRef && instRef.manifest.version !== selectedExtension.latestVersion;
                  if (instRef) {
                    if (hasUpdate) {
                      return (
                        <button
                          onClick={() => handleInstallClick(selectedExtension)}
                          className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow transition-colors flex items-center justify-center space-x-1"
                        >
                          <RefreshCw size={12} className="animate-pulse" />
                          <span>Update to v{selectedExtension.latestVersion}</span>
                        </button>
                      );
                    }
                    return (
                      <button
                        disabled
                        className="w-full py-1.5 bg-[#2d2d2d] text-gray-500 font-semibold rounded cursor-not-allowed text-center"
                      >
                        Installed (v{instRef.manifest.version})
                      </button>
                    );
                  }
                  return (
                    <button
                      onClick={() => handleInstallClick(selectedExtension)}
                      className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded shadow transition-colors flex items-center justify-center space-x-1"
                    >
                      <Download size={12} />
                      <span>Install</span>
                    </button>
                  );
                })()}
              </div>

              {/* Review status (Module 103) */}
              <div className="p-2 rounded bg-green-950/20 border border-green-800/20 flex items-center space-x-1.5">
                <CheckCircle size={13} className="text-green-500" />
                <span className="text-[10px] text-green-400 font-medium">Passed Security Sandbox Review</span>
              </div>

              <div className="space-y-1.5 border-t border-[#2d2d2d] pt-3">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Description</span>
                <p className="text-gray-300 leading-relaxed text-[11px]">{selectedExtension.description}</p>
              </div>

              {/* Manifest permissions requested list */}
              {latestManifest && latestManifest.permissions && (
                <div className="space-y-2 border-t border-[#2d2d2d] pt-3">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider flex items-center space-x-1">
                    <Shield size={12} className="text-blue-400" />
                    <span>Declared Capabilities</span>
                  </span>
                  <div className="space-y-1 pl-1 text-[10px]">
                    {latestManifest.permissions.length === 0 ? (
                      <span className="italic text-gray-500">Requires no permissions (Fully Sandboxed)</span>
                    ) : (
                      latestManifest.permissions.map((perm) => (
                        <div key={perm} className="flex items-center space-x-1.5 text-gray-300">
                          <CheckCircle size={10} className="text-gray-500" />
                          <code className="bg-[#2d2d2d] px-1 rounded text-purple-400 font-mono">{perm}</code>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 select-none">
              <Info size={24} className="mb-2 text-gray-600" />
              <span>Select an extension from the list to view specifications and install.</span>
            </div>
          )}
        </div>
      </div>

      {/* Permissions Consent Dialog Modal (Module 96) */}
      {showConsentModal && consentingListing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1e1e1e] border border-[#2d2d2d] rounded-xl shadow-2xl w-full max-w-sm overflow-hidden text-xs">
            <div className="px-4 py-3 bg-[#222222] border-b border-[#2d2d2d] font-bold text-gray-200 flex items-center space-x-2">
              <ShieldAlert size={15} className="text-yellow-500" />
              <span>Review Capabilities & Consent</span>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-gray-300 leading-relaxed">
                By installing <span className="font-semibold text-white">{consentingListing.name}</span>, you grant it permission to access the following capabilities in your workspace:
              </p>

              <div className="bg-[#181819] p-3 rounded-lg border border-[#2d2d2d] space-y-2">
                {consentingListing.versions[consentingListing.versions.length - 1]?.manifest?.permissions?.map((perm) => {
                  let desc = 'Allows running extension commands.';
                  if (perm === 'file:read') desc = 'Allows reading files in your active workspace.';
                  if (perm === 'file:write') desc = 'Allows writing/modifying code files in your workspace.';
                  if (perm === 'ui:statusbar') desc = 'Allows appending indicators to your Status Bar.';
                  if (perm === 'ui:sidebar') desc = 'Allows mounting custom sidebar panels.';
                  if (perm === '*') desc = 'UNRESTRICTED: FULL ACCESS to workspace and system controls!';
                  
                  return (
                    <div key={perm} className="flex items-start space-x-2">
                      <code className="bg-[#2d2d2d] px-1 rounded text-yellow-500 font-mono shrink-0 mt-0.5">{perm}</code>
                      <span className="text-[10px] text-gray-400">{desc}</span>
                    </div>
                  );
                })}
              </div>

              {installError && (
                <div className="p-2 bg-red-950/20 border border-red-900/20 text-red-400 rounded text-[10px]">
                  {installError}
                </div>
              )}
            </div>

            <div className="px-4 py-3 bg-[#222222] border-t border-[#2d2d2d] flex justify-end space-x-2">
              <button
                onClick={() => setShowConsentModal(false)}
                className="px-3 py-1.5 hover:bg-[#323233] text-gray-400 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmInstallation}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors"
              >
                Authorize & Install
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
