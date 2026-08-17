import React, { useState } from 'react';
import { useWorkspaceStore } from '../../shared/stores/useWorkspaceStore';
import { useTerminalStore } from '../../shared/stores/useTerminalStore';
import { Play, Layers, Plus, Trash2 } from 'lucide-react';

interface TaskDef {
  name: string;
  command: string;
  dependsOn?: string[];
}

export default function TasksPanel() {
  const { activeWorkspace } = useWorkspaceStore();
  const { createTerminal } = useTerminalStore();

  // Mock loading tasks from a local store or fallback to default tasks
  const [tasks, setTasks] = useState<TaskDef[]>([
    { name: 'Clean Dist', command: 'rm -rf dist' },
    { name: 'Build Code', command: 'npm run build', dependsOn: ['Clean Dist'] },
    { name: 'Start Dev Server', command: 'npm run dev' },
    { name: 'Lint Source', command: 'npm run lint' }
  ]);

  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskCommand, setNewTaskCommand] = useState('');
  const [newTaskDeps, setNewTaskDeps] = useState('');

  if (!activeWorkspace) return null;

  // Topological sorting / dependency resolution
  const resolveDependencies = (taskName: string, resolved: TaskDef[] = [], visited: Set<string> = new Set()): TaskDef[] => {
    if (visited.has(taskName)) {
      throw new Error(`Circular dependency detected in tasks: ${Array.from(visited).join(' -> ')}`);
    }

    visited.add(taskName);
    const task = tasks.find(t => t.name === taskName);
    if (!task) return resolved;

    if (task.dependsOn) {
      for (const dep of task.dependsOn) {
        resolveDependencies(dep, resolved, new Set(visited));
      }
    }

    if (!resolved.some(r => r.name === task.name)) {
      resolved.push(task);
    }

    return resolved;
  };

  const handleRunTask = (taskName: string) => {
    try {
      const resolvedSequence = resolveDependencies(taskName);
      // Join commands with && to ensure sequence
      const fullCommandLine = resolvedSequence.map(t => t.command).join(' && ');

      // Launch in dedicated terminal session
      createTerminal(activeWorkspace._id, fullCommandLine);
    } catch (err: any) {
      alert(`Task Error: ${err.message}`);
    }
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim() || !newTaskCommand.trim()) return;

    const dependsOn = newTaskDeps.trim() ? newTaskDeps.split(',').map(d => d.trim()) : undefined;
    const task: TaskDef = {
      name: newTaskName.trim(),
      command: newTaskCommand.trim(),
      dependsOn
    };

    setTasks([...tasks, task]);
    setNewTaskName('');
    setNewTaskCommand('');
    setNewTaskDeps('');
  };

  const handleDeleteTask = (name: string) => {
    setTasks(tasks.filter(t => t.name !== name));
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e] flex flex-col text-xs text-gray-300 font-sans select-none overflow-y-auto p-3">
      {/* Task Creation Form */}
      <form onSubmit={handleAddTask} className="flex flex-wrap gap-2.5 pb-3 border-b border-[#3c3c3c] mb-3">
        <input
          type="text"
          value={newTaskName}
          onChange={(e) => setNewTaskName(e.target.value)}
          placeholder="Task Name"
          className="bg-[#252526] border border-[#3c3c3c] text-white px-2 py-1 rounded text-[10px] focus:outline-none focus:border-blue-500 flex-1 min-w-[120px]"
        />
        <input
          type="text"
          value={newTaskCommand}
          onChange={(e) => setNewTaskCommand(e.target.value)}
          placeholder="Command (e.g. npm run build)"
          className="bg-[#252526] border border-[#3c3c3c] text-white px-2 py-1 rounded text-[10px] focus:outline-none focus:border-blue-500 flex-[2] min-w-[180px]"
        />
        <input
          type="text"
          value={newTaskDeps}
          onChange={(e) => setNewTaskDeps(e.target.value)}
          placeholder="Depends on (comma separated names)"
          className="bg-[#252526] border border-[#3c3c3c] text-white px-2 py-1 rounded text-[10px] focus:outline-none focus:border-blue-500 flex-1 min-w-[150px]"
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-3 py-1 rounded flex items-center space-x-1 cursor-pointer transition-colors"
        >
          <Plus size={11} />
          <span>Add Task</span>
        </button>
      </form>

      {/* Task List */}
      <div className="flex flex-col space-y-1.5">
        {tasks.map((task) => (
          <div
            key={task.name}
            className="flex items-center justify-between py-2 px-3 bg-[#252526] hover:bg-[#2a2a2b] border border-[#2d2d2d] rounded transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-200">{task.name}</span>
                {task.dependsOn && task.dependsOn.length > 0 && (
                  <span className="text-[10px] bg-blue-900/40 text-blue-300 border border-blue-800/40 px-1.5 py-0.2 rounded flex items-center space-x-0.5">
                    <Layers size={9} />
                    <span>needs: {task.dependsOn.join(', ')}</span>
                  </span>
                )}
              </div>
              <div className="text-gray-500 font-mono text-[10px] mt-0.5 truncate">{task.command}</div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleRunTask(task.name)}
                className="p-1.5 bg-blue-900/30 hover:bg-blue-600 border border-blue-800 hover:border-blue-500 rounded text-blue-400 hover:text-white cursor-pointer transition-colors"
                title={`Run ${task.name}`}
              >
                <Play size={12} fill="currentColor" />
              </button>
              <button
                onClick={() => handleDeleteTask(task.name)}
                className="p-1.5 bg-red-900/20 hover:bg-red-700/30 border border-red-900 hover:border-red-600 rounded text-red-500 hover:text-white cursor-pointer transition-colors"
                title="Delete task"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
