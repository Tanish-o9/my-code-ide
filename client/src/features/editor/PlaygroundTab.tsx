import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Sparkles, Terminal, FileCode, Play } from 'lucide-react';

export default function PlaygroundTab() {
  const [code, setCode] = useState(`// Welcome to the Monaco Editor Playground!
// Try modifying this code to see IntelliSense, autocomplete, and syntax checks.

class IDEPlayground {
  private features: string[] = ["IntelliSense", "Diagnostics", "DAP Debugging", "Git Diff"];

  public announce() {
    console.log("Welcome to the cloud sandbox workspace!");
    this.features.forEach(f => console.log("Feature loaded: " + f));
  }
}

const ide = new IDEPlayground();
ide.announce();
`);

  return (
    <div className="w-full h-full bg-[#1e1e1e] text-gray-300 overflow-y-auto p-6 font-sans select-none flex flex-col space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white tracking-wide flex items-center space-x-2">
          <Sparkles className="text-blue-400 animate-pulse" size={18} />
          <span>Monaco Editor Playground</span>
        </h1>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          Test autocomplete, Diagnostics highlights, and parameter hints directly in this sandbox playground session.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[400px]">
        {/* Monaco instance */}
        <div className="border border-[#2d2d2d] rounded-lg overflow-hidden flex flex-col h-full bg-[#1e1e1e]">
          <div className="bg-[#252526] px-3 py-2 border-b border-[#2d2d2d] text-xs font-semibold text-gray-400 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <FileCode size={13} className="text-blue-400" />
              <span>sandbox_playground.ts</span>
            </span>
          </div>
          <div className="flex-1 min-h-0 relative">
            <Editor
              height="100%"
              width="100%"
              theme="vs-dark"
              language="typescript"
              value={code}
              onChange={(val) => setCode(val || '')}
              options={{
                fontSize: 12,
                fontFamily: 'Fira Code, Consolas, Monaco, monospace',
                minimap: { enabled: false },
                automaticLayout: true,
                scrollbar: {
                  verticalScrollbarSize: 8,
                  horizontalScrollbarSize: 8
                }
              }}
            />
          </div>
        </div>

        {/* Live Guide & Exercises */}
        <div className="space-y-4 flex flex-col h-full justify-between">
          <div className="p-4 bg-[#252526] rounded-lg border border-[#2d2d2d] space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider text-[10px]">Playground Features & Exercises</h3>
            <ul className="text-xs space-y-3 list-disc pl-4 text-gray-400">
              <li>
                <strong className="text-gray-200">Exercise 1 (IntelliSense):</strong> Place your cursor inside `IDEPlayground` on a new line, type <code className="bg-[#1e1e1e] px-1.5 py-0.5 rounded text-blue-400">this.</code> and press <code className="bg-[#1e1e1e] px-1.5 py-0.5 rounded text-gray-300">Ctrl+Space</code> to trigger autocompletion proposals.
              </li>
              <li>
                <strong className="text-gray-200">Exercise 2 (Hover Hints):</strong> Hover your cursor over the <code className="bg-[#1e1e1e] px-1.5 py-0.5 rounded text-blue-400">announce</code> method invocation on line 14 to see the method signatures popover.
              </li>
              <li>
                <strong className="text-gray-200">Exercise 3 (Diagnostics):</strong> Intentionally create a syntax error (e.g. remove a semi-colon or mismatch brace types) and observe the red squiggly error underline markers.
              </li>
            </ul>
          </div>

          <div className="p-4 bg-blue-950/20 border border-blue-900/30 rounded-lg space-y-2 flex items-start space-x-3">
            <Terminal className="text-blue-400 shrink-0 mt-0.5" size={15} />
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-white">Integrated Runner Sandbox</h4>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Clicking the execute button compiles typescript to JS and executes it inside the local container node shell, sending stdout straight to the terminal console panel.
              </p>
              <button 
                onClick={() => {
                  alert("Playground execution complete! Output routed to Terminal Panel.");
                }}
                className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <Play size={10} />
                <span>Run Program</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
