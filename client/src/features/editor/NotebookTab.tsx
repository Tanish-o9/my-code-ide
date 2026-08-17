import { useState, useEffect } from 'react';
import { Play, Plus, Trash2, Save, RefreshCw, FileCode, Edit3, Check } from 'lucide-react';
import { api } from '../../shared/lib/api';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import Editor from '@monaco-editor/react';

interface Cell {
  cell_type: 'code' | 'markdown';
  source: string[];
  outputs?: any[];
  execution_count?: number | null;
}

export default function NotebookTab({ filePath }: { filePath: string }) {
  const { activeWorkspace } = useWorkspaceStore();
  const [cells, setCells] = useState<Cell[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingCellIndex, setEditingCellIndex] = useState<number | null>(null);

  // 1. Fetch & Parse Notebook Content
  const loadNotebook = async () => {
    if (!activeWorkspace) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/workspaces/${activeWorkspace._id}/files/content`, {
        params: { filePath }
      });
      const data = JSON.parse(res.data || '{"cells": []}');
      setCells(data.cells || []);
    } catch (err) {
      // Create empty notebook if file not found or corrupted
      setCells([
        { cell_type: 'markdown', source: ['# Python Jupyter Notebook', 'Double click or select edit to edit this markdown block.'] },
        { cell_type: 'code', source: ['print("Hello, Jupyter!")'], outputs: [] }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotebook();
  }, [filePath, activeWorkspace]);

  // 2. Save Notebook to Disk
  const saveNotebook = async (updatedCells = cells) => {
    if (!activeWorkspace) return;
    try {
      const payload = {
        cells: updatedCells,
        metadata: {
          kernelspec: {
            display_name: 'Python 3',
            language: 'python',
            name: 'python3'
          }
        },
        nbformat: 4,
        nbformat_minor: 2
      };
      await api.post(`/workspaces/${activeWorkspace._id}/files/save`, {
        filePath,
        content: JSON.stringify(payload, null, 2)
      });
    } catch (err) {
      console.error('Failed to save notebook:', err);
    }
  };

  const handleCellChange = (index: number, newCode: string) => {
    const updated = [...cells];
    updated[index].source = newCode.split('\n');
    setCells(updated);
    saveNotebook(updated);
  };

  const addCell = (type: 'code' | 'markdown') => {
    const updated = [...cells, { cell_type: type, source: [], outputs: type === 'code' ? [] : undefined }];
    setCells(updated);
    saveNotebook(updated);
  };

  const deleteCell = (index: number) => {
    const updated = cells.filter((_, idx) => idx !== index);
    setCells(updated);
    saveNotebook(updated);
  };

  // 3. Execute Code Cell in Sandbox Python
  const runCell = async (index: number) => {
    if (!activeWorkspace) return;
    const cell = cells[index];
    if (cell.cell_type !== 'code') return;

    const sourceCode = cell.source.join('\n');
    
    // Set cell status to running
    const runningCells = [...cells];
    runningCells[index].execution_count = null;
    runningCells[index].outputs = [{ output_type: 'stream', name: 'stdout', text: ['Executing cell...'] }];
    setCells(runningCells);

    try {
      const res = await api.post(`/workspaces/${activeWorkspace._id}/execution/python/notebook/run-cell`, {
        code: sourceCode
      });
      const { stdout, stderr, exitCode } = res.data;

      const completedCells = [...cells];
      completedCells[index].execution_count = index + 1;
      
      const outputs = [];
      if (stdout) {
        outputs.push({ output_type: 'stream', name: 'stdout', text: stdout.split('\n') });
      }
      if (stderr) {
        outputs.push({ output_type: 'stream', name: 'stderr', text: stderr.split('\n') });
      }
      if (!stdout && !stderr) {
        outputs.push({ output_type: 'stream', name: 'stdout', text: [`[Cell exited with code ${exitCode}]`] });
      }

      completedCells[index].outputs = outputs;
      setCells(completedCells);
      saveNotebook(completedCells);
    } catch (err: any) {
      const errorCells = [...cells];
      errorCells[index].execution_count = index + 1;
      errorCells[index].outputs = [{ output_type: 'stream', name: 'stderr', text: [err.response?.data?.error || 'Execution failed'] }];
      setCells(errorCells);
      saveNotebook(errorCells);
    }
  };

  const runAllCells = async () => {
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].cell_type === 'code') {
        await runCell(i);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-full bg-[#1e1e1e] text-gray-500 space-y-2">
        <div className="w-6 h-6 border-2 border-t-blue-500 border-blue-500/15 rounded-full animate-spin"></div>
        <span className="text-xs">Loading notebook environment...</span>
      </div>
    );
  }

  const theme = activeWorkspace?.settings?.theme === 'light' ? 'vs' : 'vs-dark';

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-gray-300 select-text overflow-hidden">
      {/* Notebook Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#2d2d2d] bg-[#1c1c1f] select-none text-xs flex-shrink-0">
        <div className="flex items-center space-x-2">
          <FileCode className="text-green-500" size={15} />
          <span className="font-semibold text-gray-200">{filePath.split('/').pop()}</span>
          <span className="text-[10px] text-gray-500 font-mono bg-[#252526] px-1.5 py-0.5 rounded border border-[#2d2d2d]">
            Python 3 Kernel
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={runAllCells}
            className="flex items-center space-x-1 px-2.5 py-1 bg-green-700/20 hover:bg-green-700/30 text-green-400 border border-green-800/40 rounded transition-colors text-[10px]"
          >
            <Play size={10} fill="currentColor" />
            <span>Run All</span>
          </button>
          <button
            onClick={() => addCell('code')}
            className="flex items-center space-x-1 px-2 py-1 bg-[#252526] hover:bg-[#2e2e30] border border-[#2d2d2d] rounded transition-colors text-[10px]"
          >
            <Plus size={10} />
            <span>Code</span>
          </button>
          <button
            onClick={() => addCell('markdown')}
            className="flex items-center space-x-1 px-2 py-1 bg-[#252526] hover:bg-[#2e2e30] border border-[#2d2d2d] rounded transition-colors text-[10px]"
          >
            <Plus size={10} />
            <span>Markdown</span>
          </button>
          <button
            onClick={loadNotebook}
            className="p-1 hover:bg-[#333] rounded transition-colors text-gray-400 hover:text-white"
            title="Restart kernel / reload"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => saveNotebook()}
            className="p-1 hover:bg-[#333] rounded transition-colors text-gray-400 hover:text-white"
            title="Save notebook"
          >
            <Save size={12} />
          </button>
        </div>
      </div>

      {/* Notebook Cells Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {cells.map((cell, idx) => (
          <div
            key={idx}
            className={`border rounded-lg overflow-hidden group/cell transition-shadow ${
              cell.cell_type === 'code' ? 'border-[#2d2d2d] bg-[#1e1e1e]' : 'border-transparent bg-transparent'
            }`}
          >
            {/* Cell Controls Bar */}
            <div className="flex items-center justify-between px-3 py-1 bg-[#1a1a1c] border-b border-[#2d2d2d]/40 text-[10px] text-gray-500 opacity-0 group-hover/cell:opacity-100 transition-opacity">
              <span className="font-semibold text-gray-400 capitalize">{cell.cell_type} Cell</span>
              <div className="flex items-center space-x-2">
                {cell.cell_type === 'markdown' && (
                  <button
                    onClick={() => setEditingCellIndex(editingCellIndex === idx ? null : idx)}
                    className="p-0.5 hover:bg-[#333] rounded text-gray-400 hover:text-white"
                  >
                    {editingCellIndex === idx ? <Check size={11} /> : <Edit3 size={11} />}
                  </button>
                )}
                <button
                  onClick={() => deleteCell(idx)}
                  className="p-0.5 hover:bg-[#333] rounded text-gray-500 hover:text-red-400"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>

            {/* Cell Editor / Render Content */}
            <div className="p-3">
              {cell.cell_type === 'code' ? (
                <div className="flex space-x-3 items-start">
                  <div className="flex flex-col items-center space-y-2 mt-1">
                    <button
                      onClick={() => runCell(idx)}
                      className="p-1.5 bg-[#252526] hover:bg-green-700/20 text-gray-400 hover:text-green-500 border border-[#2d2d2d] rounded-full transition-colors flex items-center justify-center shadow-md"
                      title="Run Cell"
                    >
                      <Play size={10} fill="currentColor" />
                    </button>
                    <span className="text-[9px] font-mono text-gray-500">
                      [{cell.execution_count ? cell.execution_count : ' '}]
                    </span>
                  </div>
                  <div className="flex-1 border border-[#2d2d2d] rounded overflow-hidden">
                    <Editor
                      height="90px"
                      width="100%"
                      theme={theme}
                      language="python"
                      value={cell.source.join('\n')}
                      onChange={(val) => handleCellChange(idx, val || '')}
                      options={{
                        lineNumbers: 'off',
                        minimap: { enabled: false },
                        folding: false,
                        lineDecorationsWidth: 0,
                        lineNumbersMinChars: 0,
                        scrollbar: { vertical: 'hidden', horizontal: 'auto' },
                        automaticLayout: true,
                        fontSize: 12
                      }}
                    />
                  </div>
                </div>
              ) : (
                // Markdown Cell
                <div>
                  {editingCellIndex === idx ? (
                    <textarea
                      value={cell.source.join('\n')}
                      onChange={(e) => handleCellChange(idx, e.target.value)}
                      className="w-full bg-[#1b1b1c] border border-[#2d2d2d] rounded p-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500 font-mono"
                      rows={4}
                      autoFocus
                    />
                  ) : (
                    <div 
                      onDoubleClick={() => setEditingCellIndex(idx)}
                      className="prose prose-invert max-w-none text-xs text-gray-300 leading-relaxed font-sans px-2"
                    >
                      {cell.source.join('\n') ? (
                        cell.source.map((line, lIdx) => (
                          <div key={lIdx}>{line.startsWith('#') ? <span className="font-bold text-sm text-white block mt-1">{line.replace(/^#+\s*/, '')}</span> : line}</div>
                        ))
                      ) : (
                        <span className="text-gray-600 italic">Double click to add markdown content...</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Output Panel for Code Cells */}
            {cell.cell_type === 'code' && cell.outputs && cell.outputs.length > 0 && (
              <div className="bg-[#151516] border-t border-[#2d2d2d]/30 p-3 font-mono text-[11px] space-y-1">
                {cell.outputs.map((out, oIdx) => (
                  <div
                    key={oIdx}
                    className={out.name === 'stderr' ? 'text-red-400' : 'text-gray-300'}
                  >
                    {out.text ? out.text.join('\n') : JSON.stringify(out)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
