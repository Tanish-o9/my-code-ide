import { useEffect, useState } from 'react';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { useEditorStore } from '../../shared/stores/useEditorStore';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

interface ProblemItem {
  resource: string;
  owner: string;
  code?: string;
  severity: number;
  message: string;
  startLineNumber: number;
  startColumn: number;
}

export default function ProblemsPanel() {
  const { activeWorkspace } = useWorkspaceStore();
  const { openTab } = useEditorStore();
  const [problems, setProblems] = useState<ProblemItem[]>([]);

  useEffect(() => {
    const updateMarkers = () => {
      // Access global monaco instance to read model markers
      const monaco = (window as any).monaco;
      if (!monaco) return;

      const markers = monaco.editor.getModelMarkers({});
      const parsedProblems: ProblemItem[] = markers.map((m: any) => ({
        resource: m.resource.path || m.resource.toString(),
        owner: m.owner,
        code: m.code,
        severity: m.severity, // 8 = Error, 4 = Warning, 2 = Info
        message: m.message,
        startLineNumber: m.startLineNumber,
        startColumn: m.startColumn
      }));

      setProblems(parsedProblems);
    };

    // Run initially
    updateMarkers();

    // Listen to changes in markers
    const monaco = (window as any).monaco;
    let disposable: any;
    if (monaco) {
      disposable = monaco.editor.onDidChangeMarkers(() => {
        updateMarkers();
      });
    }

    const interval = setInterval(updateMarkers, 1000); // fallback polling

    return () => {
      if (disposable) disposable.dispose();
      clearInterval(interval);
    };
  }, []);

  if (!activeWorkspace) return null;

  const handleProblemClick = (prob: ProblemItem) => {
    // Convert path to workspace relative path
    let relPath = prob.resource;
    if (relPath.startsWith('/')) {
      relPath = relPath.substring(1);
    }
    
    // Trigger editor store to open the file
    openTab(activeWorkspace._id, relPath);

    // Give Monaco editor instance a tiny timeout to focus and jump
    setTimeout(() => {
      const monaco = (window as any).monaco;
      const activeEditor = monaco?.editor?.getEditors()[0];
      if (activeEditor) {
        activeEditor.setPosition({ lineNumber: prob.startLineNumber, column: prob.startColumn });
        activeEditor.revealPositionInCenter({ lineNumber: prob.startLineNumber, column: prob.startColumn });
        activeEditor.focus();
      }
    }, 150);
  };

  const getSeverityIcon = (severity: number) => {
    if (severity === 8) return <AlertCircle className="text-red-500" size={14} />;
    if (severity === 4) return <AlertTriangle className="text-yellow-500" size={14} />;
    return <Info className="text-blue-400" size={14} />;
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e] flex flex-col text-xs text-gray-300 font-sans select-none overflow-y-auto p-3">
      {problems.length === 0 ? (
        <div className="flex flex-col justify-center items-center h-full text-gray-500 space-y-1">
          <Info size={16} />
          <span>No problems have been detected in the workspace.</span>
        </div>
      ) : (
        <div className="flex flex-col space-y-1.5">
          <div className="text-gray-400 font-medium pb-2 border-b border-[#3c3c3c]">
            {problems.length} {problems.length === 1 ? 'problem' : 'problems'} found
          </div>
          {problems.map((prob, idx) => {
            const fileName = prob.resource.split('/').pop() || prob.resource;
            return (
              <div
                key={idx}
                onClick={() => handleProblemClick(prob)}
                className="flex items-start space-x-2 py-1.5 px-2 hover:bg-[#252526] rounded cursor-pointer transition-colors border-b border-[#2d2d2d]/30"
              >
                <span className="mt-0.5">{getSeverityIcon(prob.severity)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-gray-200 font-medium truncate">{prob.message}</div>
                  <div className="text-gray-500 text-[10px] flex items-center space-x-1.5 mt-0.5">
                    <span className="font-semibold text-blue-400">{fileName}</span>
                    <span>[{prob.startLineNumber}, {prob.startColumn}]</span>
                    <span>•</span>
                    <span className="italic">{prob.owner}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
