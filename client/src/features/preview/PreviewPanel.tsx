import { useState, useRef } from 'react';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { 
  RotateCw, 
  ExternalLink, 
  Globe 
} from 'lucide-react';

interface PreviewPanelProps {
  port: string;
}

export default function PreviewPanel({ port: initialPort }: PreviewPanelProps) {
  const { activeWorkspace } = useWorkspaceStore();
  const [port, setPort] = useState(initialPort);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  if (!activeWorkspace) return null;

  const backendUrl = 'http://localhost:5000';
  // Use cookies-based auth proxy route
  const previewUrl = `${backendUrl}/api/workspaces/${activeWorkspace._id}/preview/${port}/`;

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  const handleOpenExternal = () => {
    window.open(previewUrl, '_blank');
  };

  return (
    <div className="w-full h-full flex flex-col bg-white text-gray-800">
      {/* Top Address Bar */}
      <div className="flex items-center space-x-2 p-1.5 bg-[#f3f3f3] border-b border-gray-300 text-xs select-none">
        <Globe size={14} className="text-gray-500 flex-shrink-0" />
        
        {/* Port selector input */}
        <div className="flex items-center bg-white border border-gray-300 rounded px-1.5 py-0.5">
          <span className="text-[10px] text-gray-400 font-bold uppercase mr-1">Port:</span>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className="w-12 bg-transparent text-xs text-gray-800 focus:outline-none border-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        {/* Address text box */}
        <div className="flex-1 bg-white border border-gray-300 rounded px-2.5 py-0.5 text-gray-500 truncate text-[11px]">
          {previewUrl}
        </div>

        {/* Controls */}
        <button
          onClick={handleRefresh}
          className="p-1 hover:bg-gray-200 rounded text-gray-600 transition-colors"
          title="Refresh preview"
        >
          <RotateCw size={13} />
        </button>
        
        <button
          onClick={handleOpenExternal}
          className="p-1 hover:bg-gray-200 rounded text-gray-600 transition-colors"
          title="Open in new tab"
        >
          <ExternalLink size={13} />
        </button>
      </div>

      {/* Frame content */}
      <div className="flex-1 w-full bg-white relative">
        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={previewUrl}
          className="w-full h-full border-none bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
