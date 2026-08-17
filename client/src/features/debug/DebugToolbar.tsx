import { useEffect } from 'react';
import { useDebugStore } from '../../shared/stores/useDebugStore';
import { 
  Play, Pause, ArrowRight, CornerDownRight, CornerUpLeft, 
  RotateCcw, StopCircle 
} from 'lucide-react';

export default function DebugToolbar() {
  const { status, sendDAPRequest, stopDebugging } = useDebugStore();

  const handleContinue = () => sendDAPRequest('continue');
  const handlePause = () => sendDAPRequest('pause');
  const handleStepOver = () => sendDAPRequest('next');
  const handleStepInto = () => sendDAPRequest('stepIn');
  const handleStepOut = () => sendDAPRequest('stepOut');
  
  const handleRestart = () => {
    sendDAPRequest('restart');
  };

  const handleStop = () => {
    stopDebugging();
  };

  // Keyboard conventions (Module 80)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status === 'stopped') return;

      if (e.key === 'F5') {
        e.preventDefault();
        if (e.shiftKey) {
          handleStop();
        } else {
          handleContinue();
        }
      } else if (e.key === 'F10') {
        e.preventDefault();
        handleStepOver();
      } else if (e.key === 'F11') {
        e.preventDefault();
        if (e.shiftKey) {
          handleStepOut();
        } else {
          handleStepInto();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status]);

  if (status === 'stopped') return null;

  return (
    <div className="fixed top-12 left-1/2 transform -translate-x-1/2 bg-[#252526]/90 backdrop-blur-md border border-[#3e3e3e] shadow-2xl rounded-full px-4 py-1.5 flex items-center space-x-1 z-50 transition-all select-none">
      <div className="flex items-center space-x-2 mr-3 border-r border-[#3e3e3e] pr-3 text-[10px] font-bold text-gray-400">
        <span className={`w-2 h-2 rounded-full ${status === 'paused' ? 'bg-yellow-500 animate-pulse' : 'bg-green-500 animate-pulse'}`} />
        <span className="uppercase tracking-widest">{status}</span>
      </div>

      <button
        onClick={status === 'paused' ? handleContinue : handlePause}
        className="p-1.5 hover:bg-[#323233] text-gray-300 hover:text-white rounded-full transition-colors"
        title={status === 'paused' ? 'Continue (F5)' : 'Pause'}
      >
        {status === 'paused' ? <Play size={13} fill="currentColor" className="text-green-500" /> : <Pause size={13} fill="currentColor" className="text-blue-400" />}
      </button>

      <button
        onClick={handleStepOver}
        disabled={status === 'running'}
        className="p-1.5 hover:bg-[#323233] disabled:opacity-30 text-gray-300 hover:text-white rounded-full transition-colors"
        title="Step Over (F10)"
      >
        <ArrowRight size={13} className="text-purple-400" />
      </button>

      <button
        onClick={handleStepInto}
        disabled={status === 'running'}
        className="p-1.5 hover:bg-[#323233] disabled:opacity-30 text-gray-300 hover:text-white rounded-full transition-colors"
        title="Step Into (F11)"
      >
        <CornerDownRight size={13} className="text-blue-400" />
      </button>

      <button
        onClick={handleStepOut}
        disabled={status === 'running'}
        className="p-1.5 hover:bg-[#323233] disabled:opacity-30 text-gray-300 hover:text-white rounded-full transition-colors"
        title="Step Out (Shift+F11)"
      >
        <CornerUpLeft size={13} className="text-yellow-500" />
      </button>

      <button
        onClick={handleRestart}
        className="p-1.5 hover:bg-[#323233] text-gray-300 hover:text-white rounded-full transition-colors"
        title="Restart Session"
      >
        <RotateCcw size={13} className="text-orange-400" />
      </button>

      <button
        onClick={handleStop}
        className="p-1.5 hover:bg-[#323233] text-gray-300 hover:text-red-400 rounded-full transition-colors"
        title="Stop Session (Shift+F5)"
      >
        <StopCircle size={13} fill="currentColor" className="text-red-500" />
      </button>
    </div>
  );
}
