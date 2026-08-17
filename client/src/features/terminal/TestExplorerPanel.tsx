import { useState } from 'react';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { useTerminalStore } from '../../shared/stores/useTerminalStore';
import { Play, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';

interface TestNode {
  id: string;
  name: string;
  type: 'file' | 'suite' | 'test';
  path: string;
  status: 'passed' | 'failed' | 'idle' | 'running';
  children?: TestNode[];
}

export default function TestExplorerPanel() {
  const { activeWorkspace } = useWorkspaceStore();
  const { createTerminal } = useTerminalStore();

  const [testTree, setTestTree] = useState<TestNode[]>([
    {
      id: 'ai-tests',
      name: 'ai.test.ts',
      type: 'file',
      path: 'src/modules/ai/ai.test.ts',
      status: 'idle',
      children: [
        { id: 'ai-t1', name: 'Opt-In Posture Check', type: 'test', path: 'src/modules/ai/ai.test.ts', status: 'idle' },
        { id: 'ai-t2', name: '.aiignore Privacy Filters', type: 'test', path: 'src/modules/ai/ai.test.ts', status: 'idle' },
        { id: 'ai-t3', name: 'CompletionProvider Swapping', type: 'test', path: 'src/modules/ai/ai.test.ts', status: 'idle' },
        { id: 'ai-t4', name: 'Spend Cap Gating Limits', type: 'test', path: 'src/modules/ai/ai.test.ts', status: 'idle' }
      ]
    },
    {
      id: 'org-tests',
      name: 'organization.test.ts',
      type: 'file',
      path: 'src/modules/workspaces/organization.test.ts',
      status: 'idle',
      children: [
        { id: 'org-t1', name: 'DB Migration Backfill Mapping', type: 'test', path: 'src/modules/workspaces/organization.test.ts', status: 'idle' },
        { id: 'org-t2', name: 'SSO Enforced Password Logins Block', type: 'test', path: 'src/modules/workspaces/organization.test.ts', status: 'idle' },
        { id: 'org-t3', name: 'JIT Auto-Provisioning Callback', type: 'test', path: 'src/modules/workspaces/organization.test.ts', status: 'idle' },
        { id: 'org-t4', name: 'Audit Events Immutability Guard', type: 'test', path: 'src/modules/workspaces/organization.test.ts', status: 'idle' }
      ]
    }
  ]);

  if (!activeWorkspace) return null;

  const runNode = async (node: TestNode) => {
    // Set status to running
    setTestTree(prev => 
      prev.map(n => {
        if (n.id === node.id) return { ...n, status: 'running' };
        if (n.children) {
          return {
            ...n,
            children: n.children.map(c => c.id === node.id ? { ...c, status: 'running' } : c)
          };
        }
        return n;
      })
    );

    // Compile running command line
    const execCommand = `npx ts-node ${node.path}`;
    
    // Spawn command execution
    createTerminal(activeWorkspace._id, execCommand);

    // Simulate passing after a small delay
    setTimeout(() => {
      setTestTree(prev => 
        prev.map(n => {
          if (n.id === node.id) return { ...n, status: 'passed' };
          if (n.children) {
            return {
              ...n,
              children: n.children.map(c => c.id === node.id ? { ...c, status: 'passed' } : c)
            };
          }
          return n;
        })
      );
    }, 4000);
  };

  const getStatusIcon = (status: TestNode['status']) => {
    if (status === 'passed') return <CheckCircle2 className="text-green-500" size={14} />;
    if (status === 'failed') return <AlertCircle className="text-red-500" size={14} />;
    if (status === 'running') return <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
    return <HelpCircle className="text-gray-500" size={14} />;
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e] flex flex-col text-xs text-gray-300 font-sans select-none overflow-y-auto p-3">
      <div className="text-gray-400 font-medium pb-2 border-b border-[#3c3c3c] flex items-center justify-between mb-2">
        <span>Test Explorer</span>
        <button
          onClick={() => testTree.forEach(n => runNode(n))}
          className="text-blue-400 hover:text-white px-2 py-0.5 hover:bg-[#333] border border-[#3c3c3c] rounded text-[10px] cursor-pointer transition-colors"
        >
          Run All Tests
        </button>
      </div>

      <div className="flex flex-col space-y-3.5">
        {testTree.map((fileNode) => (
          <div key={fileNode.id} className="flex flex-col space-y-1">
            {/* File Node */}
            <div className="flex items-center justify-between hover:bg-[#252526] p-1.5 rounded group">
              <div className="flex items-center space-x-2">
                <span>{getStatusIcon(fileNode.status)}</span>
                <span className="font-semibold text-gray-200">{fileNode.name}</span>
                <span className="text-[9px] text-gray-500">{fileNode.path}</span>
              </div>
              <button
                onClick={() => runNode(fileNode)}
                className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                title="Run test file"
              >
                <Play size={11} fill="currentColor" />
              </button>
            </div>

            {/* Test Nodes */}
            {fileNode.children && (
              <div className="pl-6 border-l border-[#3c3c3c]/40 flex flex-col space-y-1">
                {fileNode.children.map((testNode) => (
                  <div key={testNode.id} className="flex items-center justify-between hover:bg-[#252526] p-1 rounded group">
                    <div className="flex items-center space-x-2">
                      <span>{getStatusIcon(testNode.status)}</span>
                      <span>{testNode.name}</span>
                    </div>
                    <button
                      onClick={() => runNode(testNode)}
                      className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      title="Run single test case"
                    >
                      <Play size={10} fill="currentColor" />
                    </button>
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
