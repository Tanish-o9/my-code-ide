import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { useEditorStore } from '../../shared/stores/useEditorStore';
import { getFsSocket } from '../../shared/lib/socket';
import { cursorPositionsCache } from '../../shared/hooks/useSessionRestore';
import { api } from '../../shared/lib/api';
import { 
  Search, 
  CaseSensitive, 
  Type, 
  WholeWord, 
  Loader2, 
  ChevronDown, 
  ChevronRight,
  FileCode,
  ReplaceAll
} from 'lucide-react';

interface SearchResult {
  file: string;
  lineNumber: number;
  lineContent: string;
  matchIndex: number;
  matchLength: number;
}

export default function GlobalSearchPanel() {
  const { activeWorkspace } = useWorkspaceStore();
  const { openTab, openTabs: globalTabs, updateTabContent } = useEditorStore();

  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [includes, setIncludes] = useState('');
  const [excludes, setExcludes] = useState('');

  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});

  const socket = getFsSocket();

  useEffect(() => {
    if (!activeWorkspace) return;

    // Connect to Socket and join workspace
    socket.connect();
    socket.emit('join', activeWorkspace._id);

    // Listen to streaming search matches
    socket.on('search:start', () => {
      setResults([]);
      setIsSearching(true);
    });

    socket.on('search:match', (match: SearchResult) => {
      setResults((prev) => [...prev, match]);
    });

    socket.on('search:end', () => {
      setIsSearching(false);
    });

    socket.on('search:error', (data: { error: string }) => {
      alert(data.error || 'Search error');
      setIsSearching(false);
    });

    return () => {
      socket.off('search:start');
      socket.off('search:match');
      socket.off('search:end');
      socket.off('search:error');
    };
  }, [activeWorkspace, socket]);

  if (!activeWorkspace) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    socket.emit('search', {
      workspaceId: activeWorkspace._id,
      query,
      caseSensitive,
      isRegex,
      wholeWord,
      includes: includes.trim() ? includes.split(',').map((s) => s.trim()) : [],
      excludes: excludes.trim() ? excludes.split(',').map((s) => s.trim()) : [],
    });
  };

  const handleResultClick = async (match: SearchResult) => {
    // 1. Seed cursor positions cache to highlight selection on mount
    cursorPositionsCache[match.file] = {
      lineNumber: match.lineNumber,
      column: match.matchIndex + 1,
      scrollTop: 0,
      scrollLeft: 0,
    };

    // 2. Open tab globally (which handles splitting active layout panes automatically)
    await openTab(activeWorkspace._id, match.file);
  };

  // Group search results by file path
  const groupedResults = results.reduce<Record<string, SearchResult[]>>((acc, match) => {
    if (!acc[match.file]) acc[match.file] = [];
    acc[match.file].push(match);
    return acc;
  }, {});

  const toggleFileCollapse = (filePath: string) => {
    setCollapsedFiles((prev) => ({
      ...prev,
      [filePath]: !prev[filePath],
    }));
  };

  // Reconcile replace-all across open models and on-disk files
  const handleReplaceAll = async () => {
    if (results.length === 0) return;
    if (!confirm(`Replace all occurrences of "${query}" with "${replaceText}" across ${Object.keys(groupedResults).length} files?`)) {
      return;
    }

    setIsSearching(true);

    try {
      for (const [filePath, fileMatches] of Object.entries(groupedResults)) {
        const isOpen = globalTabs.some((t) => t.path === filePath);

        if (isOpen) {
          // 1. Replace inside active Monaco model content in store (which propagates to all splits)
          const tab = globalTabs.find((t) => t.path === filePath)!;
          const updatedContent = performReplacements(tab.content, fileMatches, replaceText);
          updateTabContent(activeWorkspace._id, filePath, updatedContent);
        } else {
          // 2. Fetch, replace, and write closed files directly through backend
          const res = await api.get(`/workspaces/${activeWorkspace._id}/files/content`, {
            params: { path: filePath }
          });
          const updatedContent = performReplacements(res.data.content, fileMatches, replaceText);
          await api.put(`/workspaces/${activeWorkspace._id}/files/content`, {
            path: filePath,
            content: updatedContent,
          });
        }
      }

      alert('Replace completed successfully.');
      setResults([]);
    } catch (err) {
      console.error('[SearchPanel/ReplaceAll] Error:', err);
      alert('Failed to replace occurrences');
    } finally {
      setIsSearching(false);
    }
  };

  // Helper: Substring replacements matching specific line/columns
  const performReplacements = (content: string, fileMatches: SearchResult[], replacement: string): string => {
    const lines = content.split(/\r?\n/);
    
    // Sort matches from end of file to beginning so indices don't shift!
    const sortedMatches = [...fileMatches].sort((a, b) => {
      if (a.lineNumber !== b.lineNumber) return b.lineNumber - a.lineNumber;
      return b.matchIndex - a.matchIndex;
    });

    for (const match of sortedMatches) {
      const lineIdx = match.lineNumber - 1;
      const line = lines[lineIdx];
      const left = line.substring(0, match.matchIndex);
      const right = line.substring(match.matchIndex + match.matchLength);
      lines[lineIdx] = left + replacement + right;
    }

    return lines.join('\n');
  };

  return (
    <div className="h-full flex flex-col p-2 text-xs">
      <form onSubmit={handleSearch} className="space-y-2">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search query"
            className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2.5 py-1.5 text-white pr-20 focus:outline-none focus:border-blue-500"
          />
          {/* Option toggles inside input */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setCaseSensitive(!caseSensitive)}
              className={`p-0.5 rounded hover:bg-[#333] transition-colors ${
                caseSensitive ? 'text-blue-400 bg-[#333]' : 'text-gray-500'
              }`}
              title="Match Case"
            >
              <CaseSensitive size={12} />
            </button>
            <button
              type="button"
              onClick={() => setIsRegex(!isRegex)}
              className={`p-0.5 rounded hover:bg-[#333] transition-colors ${
                isRegex ? 'text-blue-400 bg-[#333]' : 'text-gray-500'
              }`}
              title="Use Regex"
            >
              <Type size={12} />
            </button>
            <button
              type="button"
              onClick={() => setWholeWord(!wholeWord)}
              className={`p-0.5 rounded hover:bg-[#333] transition-colors ${
                wholeWord ? 'text-blue-400 bg-[#333]' : 'text-gray-500'
              }`}
              title="Whole Word"
            >
              <WholeWord size={12} />
            </button>
          </div>
        </div>

        {/* Replace block */}
        <div className="flex space-x-1">
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Replace text"
            className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2.5 py-1 text-white focus:outline-none focus:border-blue-500"
          />
          <button
            type="button"
            onClick={handleReplaceAll}
            disabled={results.length === 0}
            className="px-2 bg-[#333] hover:bg-[#444] border border-[#3c3c3c] rounded text-gray-300 disabled:opacity-30 flex items-center justify-center cursor-pointer"
            title="Replace All Occurrences"
          >
            <ReplaceAll size={14} />
          </button>
        </div>

        {/* Include / Exclude globs */}
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={includes}
            onChange={(e) => setIncludes(e.target.value)}
            placeholder="files to include (e.g. *.ts)"
            className="bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[10px] text-white focus:outline-none"
          />
          <input
            type="text"
            value={excludes}
            onChange={(e) => setExcludes(e.target.value)}
            placeholder="files to exclude"
            className="bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-[10px] text-white focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded py-1 font-semibold transition-colors disabled:opacity-50 flex items-center justify-center space-x-1 cursor-pointer"
        >
          {isSearching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          <span>Search</span>
        </button>
      </form>

      {/* Results viewport */}
      <div className="flex-grow overflow-y-auto mt-3 pr-1 space-y-1">
        {results.length > 0 ? (
          Object.entries(groupedResults).map(([filePath, fileMatches]) => {
            const isCollapsed = !!collapsedFiles[filePath];
            return (
              <div key={filePath} className="border-b border-[#2d2d30] pb-1.5 last:border-0">
                {/* File Header */}
                <div 
                  onClick={() => toggleFileCollapse(filePath)}
                  className="flex items-center space-x-1 py-1 hover:bg-[#252526] rounded cursor-pointer text-gray-300 font-semibold"
                >
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  <FileCode size={13} className="text-blue-400" />
                  <span className="truncate">{filePath}</span>
                  <span className="text-[10px] text-gray-500 ml-1">({fileMatches.length})</span>
                </div>

                {/* Matches lines */}
                {!isCollapsed && (
                  <div className="pl-4 mt-0.5 space-y-0.5">
                    {fileMatches.map((match, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleResultClick(match)}
                        className="py-0.5 px-1.5 hover:bg-[#2d2d2d] rounded cursor-pointer font-mono text-[10px] text-gray-400 hover:text-white flex items-center truncate"
                      >
                        <span className="text-blue-500 mr-2 flex-shrink-0">L{match.lineNumber}:</span>
                        <span className="truncate">{match.lineContent.trim()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        ) : query && !isSearching ? (
          <div className="text-center text-gray-500 mt-6 italic">No results found.</div>
        ) : (
          <div className="text-center text-gray-600 mt-6">Enter a term to search across workspace files.</div>
        )}
      </div>
    </div>
  );
}
