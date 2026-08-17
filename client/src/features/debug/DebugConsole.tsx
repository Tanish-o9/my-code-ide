import { useState, useRef, useEffect } from 'react';
import { useDebugStore } from '../../shared/stores/useDebugStore';
import { Terminal, Send, Trash } from 'lucide-react';

export default function DebugConsole() {
  const { consoleLogs, evaluateREPL, activeSessionId } = useDebugStore();
  const [inputText, setInputText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && activeSessionId) {
      const expr = inputText.trim();
      evaluateREPL(expr);
      setHistory([...history, expr]);
      setHistoryIndex(-1);
      setInputText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIdx);
        setInputText(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const nextIdx = historyIndex + 1;
        if (nextIdx >= history.length) {
          setHistoryIndex(-1);
          setInputText('');
        } else {
          setHistoryIndex(nextIdx);
          setInputText(history[nextIdx]);
        }
      }
    }
  };

  const clearLogs = () => {
    useDebugStore.setState({ consoleLogs: [] });
  };

  return (
    <div className="flex flex-col h-full bg-[#181818] border border-[#2d2d2d] rounded-lg overflow-hidden text-xs">
      {/* Console Header Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#202020] border-b border-[#2d2d2d] select-none">
        <div className="flex items-center space-x-2">
          <Terminal size={13} className="text-blue-400" />
          <span className="font-semibold text-gray-300">Debug Console</span>
        </div>
        <button
          onClick={clearLogs}
          className="p-1 hover:bg-[#2d2d2d] rounded text-gray-400 hover:text-white transition-colors"
          title="Clear Logs"
        >
          <Trash size={12} />
        </button>
      </div>

      {/* Merged Output Logs Container */}
      <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] space-y-1 select-text">
        {consoleLogs.length === 0 ? (
          <div className="text-gray-500 italic text-center py-4 select-none">
            Console output and REPL expressions will show here...
          </div>
        ) : (
          consoleLogs.map((log, idx) => (
            <div 
              key={idx}
              className={`leading-relaxed whitespace-pre-wrap ${
                log.category === 'stderr' 
                  ? 'text-red-400 font-semibold' 
                  : log.category === 'console' 
                    ? 'text-blue-400 font-bold' 
                    : 'text-gray-300'
              }`}
            >
              {log.text}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {/* REPL Prompts Input Footer */}
      <form onSubmit={handleSubmit} className="p-2 bg-[#1e1e1e] border-t border-[#2d2d2d] flex items-center space-x-2">
        <span className="font-mono text-blue-500 font-bold select-none">&gt;</span>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!activeSessionId}
          placeholder={activeSessionId ? "Type expression to evaluate (e.g. status)..." : "Start debug session to evaluate expressions"}
          className="flex-1 bg-[#252526] border border-[#2d2d2d] focus:border-blue-500 outline-none rounded px-2.5 py-1 text-gray-200 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!activeSessionId || !inputText.trim()}
          className="p-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-[#2b2b2c] text-white rounded transition-colors"
        >
          <Send size={11} />
        </button>
      </form>
    </div>
  );
}
