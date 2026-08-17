import { useState } from 'react';
import { Columns, List } from 'lucide-react';

export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  isBinary: boolean;
  hunks: DiffHunk[];
}

interface DiffViewerProps {
  diffs: FileDiff[] | null;
  onLineClick?: (filePath: string, lineNumber: number) => void;
  filePath: string;
}

export default function DiffViewer({ diffs, onLineClick, filePath }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'inline' | 'split'>('inline');

  if (!diffs || diffs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm select-none p-8">
        No changes detected or binary file.
      </div>
    );
  }

  const fileDiff = diffs[0];

  if (fileDiff.isBinary) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm select-none p-8">
        Binary file diff not supported.
      </div>
    );
  }

  const handleLineSelect = (line: DiffLine) => {
    if (!onLineClick) return;
    const targetLine = line.newLineNumber ?? line.oldLineNumber;
    if (targetLine !== undefined) {
      onLineClick(filePath, targetLine);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#181818] border border-[#2d2d2d] rounded-lg overflow-hidden">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#202020] border-b border-[#2d2d2d]">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-gray-300 font-mono truncate">{filePath}</span>
        </div>
        <div className="flex items-center space-x-1 bg-[#1e1e1e] p-1 rounded border border-[#2d2d2d]">
          <button
            onClick={() => setViewMode('inline')}
            className={`p-1 rounded text-xs transition-colors ${
              viewMode === 'inline'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-[#252526]'
            }`}
            title="Inline View"
          >
            <List size={12} />
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`p-1 rounded text-xs transition-colors ${
              viewMode === 'split'
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-[#252526]'
            }`}
            title="Split View"
          >
            <Columns size={12} />
          </button>
        </div>
      </div>

      {/* Diff Table */}
      <div className="flex-1 overflow-auto font-mono text-xs select-none">
        {viewMode === 'inline' ? (
          <div className="min-w-max">
            {fileDiff.hunks.map((hunk, hIdx) => (
              <div key={hIdx}>
                {/* Hunk Header */}
                <div className="bg-[#1b2b34]/40 text-[#4f5b66] px-4 py-1 border-y border-[#2d2d2d] font-semibold text-[10px]">
                  {hunk.header}
                </div>
                {hunk.lines.map((line, lIdx) => {
                  let rowBg = 'hover:bg-[#252526]';
                  let charPrefix = ' ';
                  let textColor = 'text-gray-300';

                  if (line.type === 'add') {
                    rowBg = 'bg-[#1b3c20]/30 hover:bg-[#1b3c20]/50';
                    charPrefix = '+';
                    textColor = 'text-green-300';
                  } else if (line.type === 'delete') {
                    rowBg = 'bg-[#4c1c1c]/30 hover:bg-[#4c1c1c]/50';
                    charPrefix = '-';
                    textColor = 'text-red-300';
                  }

                  return (
                    <div
                      key={lIdx}
                      onClick={() => handleLineSelect(line)}
                      className={`flex items-stretch border-l border-transparent hover:border-blue-500 cursor-pointer ${rowBg}`}
                    >
                      {/* Old Line Number */}
                      <div className="w-12 text-right pr-3 text-gray-600 select-none bg-[#1e1e1e]/20 border-r border-[#2d2d2d]/30 py-0.5">
                        {line.oldLineNumber ?? ''}
                      </div>
                      {/* New Line Number */}
                      <div className="w-12 text-right pr-3 text-gray-600 select-none bg-[#1e1e1e]/20 border-r border-[#2d2d2d]/30 py-0.5">
                        {line.newLineNumber ?? ''}
                      </div>
                      {/* Line content */}
                      <div className={`pl-3 pr-4 whitespace-pre py-0.5 flex-1 ${textColor}`}>
                        <span className="select-none opacity-50 mr-2">{charPrefix}</span>
                        {line.content}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          /* Split View */
          <div className="flex h-full divide-x divide-[#2d2d2d]">
            {/* Left side: Old File */}
            <div className="flex-1 overflow-x-auto min-w-0">
              <div className="bg-[#202020] text-gray-400 font-semibold px-4 py-1.5 border-b border-[#2d2d2d] sticky top-0 text-[10px]">
                ORIGINAL
              </div>
              {fileDiff.hunks.map((hunk, hIdx) => (
                <div key={hIdx}>
                  <div className="bg-[#1b2b34]/20 text-[#4f5b66] px-4 py-1 border-b border-[#2d2d2d]/50 font-semibold text-[10px]">
                    {hunk.header}
                  </div>
                  {hunk.lines
                    .filter((line) => line.type !== 'add')
                    .map((line, lIdx) => (
                      <div
                        key={lIdx}
                        onClick={() => handleLineSelect(line)}
                        className={`flex items-stretch cursor-pointer ${
                          line.type === 'delete'
                            ? 'bg-[#4c1c1c]/30 hover:bg-[#4c1c1c]/50'
                            : 'hover:bg-[#252526]'
                        }`}
                      >
                        <div className="w-12 text-right pr-3 text-gray-600 select-none bg-[#1e1e1e]/20 border-r border-[#2d2d2d]/30 py-0.5">
                          {line.oldLineNumber ?? ''}
                        </div>
                        <div className={`pl-3 pr-4 whitespace-pre py-0.5 flex-1 ${line.type === 'delete' ? 'text-red-300' : 'text-gray-400'}`}>
                          <span className="select-none opacity-50 mr-2">{line.type === 'delete' ? '-' : ' '}</span>
                          {line.content}
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </div>

            {/* Right side: New File */}
            <div className="flex-1 overflow-x-auto min-w-0">
              <div className="bg-[#202020] text-gray-400 font-semibold px-4 py-1.5 border-b border-[#2d2d2d] sticky top-0 text-[10px]">
                MODIFIED
              </div>
              {fileDiff.hunks.map((hunk, hIdx) => (
                <div key={hIdx}>
                  <div className="bg-[#1b2b34]/20 text-[#4f5b66] px-4 py-1 border-b border-[#2d2d2d]/50 font-semibold text-[10px]">
                    {hunk.header}
                  </div>
                  {hunk.lines
                    .filter((line) => line.type !== 'delete')
                    .map((line, lIdx) => (
                      <div
                        key={lIdx}
                        onClick={() => handleLineSelect(line)}
                        className={`flex items-stretch cursor-pointer ${
                          line.type === 'add'
                            ? 'bg-[#1b3c20]/30 hover:bg-[#1b3c20]/50'
                            : 'hover:bg-[#252526]'
                        }`}
                      >
                        <div className="w-12 text-right pr-3 text-gray-600 select-none bg-[#1e1e1e]/20 border-r border-[#2d2d2d]/30 py-0.5">
                          {line.newLineNumber ?? ''}
                        </div>
                        <div className={`pl-3 pr-4 whitespace-pre py-0.5 flex-1 ${line.type === 'add' ? 'text-green-300' : 'text-gray-300'}`}>
                          <span className="select-none opacity-50 mr-2">{line.type === 'add' ? '+' : ' '}</span>
                          {line.content}
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
