import { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ChevronUp, 
  ChevronDown, 
  Replace, 
  ReplaceAll, 
  Type, 
  CaseSensitive 
} from 'lucide-react';

interface FindReplaceWidgetProps {
  editor: any;
  onClose: () => void;
}

export default function FindReplaceWidget({ editor, onClose }: FindReplaceWidgetProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  
  const findInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus search input on load
    if (findInputRef.current) {
      findInputRef.current.focus();
    }
  }, []);

  // Recalculate matches whenever find options or value changes
  useEffect(() => {
    const updateMatches = () => {
      if (!editor || !findText) {
        setMatches([]);
        setCurrentIndex(-1);
        return;
      }

      const model = editor.getModel();
      if (!model) return;

      try {
        const found = model.findMatches(
          findText,
          true, // searchOnlyEditableRange
          isRegex,
          matchCase,
          null, // wordPart (whole words)
          true, // captureMatchesLimit
          1000 // limit
        );

        setMatches(found);
        
        // Find if current cursor is already on a match, or select the first one
        if (found.length > 0) {
          const selection = editor.getSelection();
          const matchIndex = found.findIndex((m: any) => 
            selection && m.range.startLineNumber >= selection.startLineNumber
          );
          setCurrentIndex(matchIndex !== -1 ? matchIndex : 0);
        } else {
          setCurrentIndex(-1);
        }
      } catch (err) {
        // Safe check for invalid regex patterns
        setMatches([]);
        setCurrentIndex(-1);
      }
    };

    updateMatches();
  }, [findText, matchCase, isRegex, editor]);

  // Navigate to current match
  useEffect(() => {
    if (editor && matches.length > 0 && currentIndex >= 0 && currentIndex < matches.length) {
      const match = matches[currentIndex];
      editor.setSelection(match.range);
      editor.revealRangeInCenter(match.range);
    }
  }, [currentIndex, matches, editor]);

  const handleNext = () => {
    if (matches.length > 0) {
      setCurrentIndex((prev) => (prev + 1) % matches.length);
    }
  };

  const handlePrev = () => {
    if (matches.length > 0) {
      setCurrentIndex((prev) => (prev - 1 + matches.length) % matches.length);
    }
  };

  const handleReplace = () => {
    if (!editor || matches.length === 0 || currentIndex < 0) return;
    
    const match = matches[currentIndex];
    
    // Drive replacements through Monaco executeEdits to integrate with undo stack
    editor.executeEdits('find-replace', [
      {
        range: match.range,
        text: replaceText,
        forceMoveMarkers: true
      }
    ]);

    // Force index adjustment
    handleNext();
  };

  const handleReplaceAll = () => {
    if (!editor || matches.length === 0) return;

    const edits = matches.map((m: any) => ({
      range: m.range,
      text: replaceText,
      forceMoveMarkers: true
    }));

    editor.executeEdits('find-replace', edits);
    console.log(`[FindReplace] Replaced ${matches.length} matches.`);
  };

  return (
    <div className="absolute right-4 top-11 z-40 bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-2xl p-2 w-72 flex flex-col space-y-2 text-xs text-gray-300">
      {/* Search row */}
      <div className="flex items-center space-x-2">
        <div className="relative flex-1">
          <input
            ref={findInputRef}
            type="text"
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="Find"
            className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500 pr-16"
          />
          {/* Toggles inside input */}
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center space-x-1">
            <button
              onClick={() => setMatchCase(!matchCase)}
              className={`p-0.5 rounded hover:bg-[#333] transition-colors ${
                matchCase ? 'text-blue-400 bg-[#333]' : 'text-gray-500'
              }`}
              title="Match Case"
            >
              <CaseSensitive size={12} />
            </button>
            <button
              onClick={() => setIsRegex(!isRegex)}
              className={`p-0.5 rounded hover:bg-[#33] transition-colors ${
                isRegex ? 'text-blue-400 bg-[#333]' : 'text-gray-500'
              }`}
              title="Use Regular Expression"
            >
              <Type size={12} />
            </button>
          </div>
        </div>

        {/* Counter */}
        <div className="text-[10px] text-gray-500 flex-shrink-0 w-12 text-right">
          {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : '0/0'}
        </div>

        {/* Navigation */}
        <div className="flex items-center space-x-0.5">
          <button
            onClick={handlePrev}
            disabled={matches.length === 0}
            className="p-1 hover:bg-[#333] rounded disabled:opacity-30"
          >
            <ChevronUp size={13} />
          </button>
          <button
            onClick={handleNext}
            disabled={matches.length === 0}
            className="p-1 hover:bg-[#333] rounded disabled:opacity-30"
          >
            <ChevronDown size={13} />
          </button>
          <button onClick={onClose} className="p-1 hover:bg-[#333] rounded text-gray-500 hover:text-white">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Replace row */}
      <div className="flex items-center space-x-2">
        <input
          type="text"
          value={replaceText}
          onChange={(e) => setReplaceText(e.target.value)}
          placeholder="Replace"
          className="flex-grow bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
        />
        
        <div className="flex items-center space-x-1 flex-shrink-0">
          <button
            onClick={handleReplace}
            disabled={matches.length === 0}
            className="p-1 hover:bg-[#333] rounded disabled:opacity-30 flex items-center justify-center"
            title="Replace Match"
          >
            <Replace size={13} />
          </button>
          <button
            onClick={handleReplaceAll}
            disabled={matches.length === 0}
            className="p-1 hover:bg-[#333] rounded disabled:opacity-30 flex items-center justify-center"
            title="Replace All Matches"
          >
            <ReplaceAll size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
