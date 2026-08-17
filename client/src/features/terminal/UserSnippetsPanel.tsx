import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface Snippet {
  id: string;
  name: string;
  prefix: string;
  body: string;
  language: string;
}

export default function UserSnippetsPanel() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [body, setBody] = useState('');
  const [language, setLanguage] = useState('javascript');

  // Load snippets from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('cloud-ide-user-snippets');
    if (saved) {
      try {
        setSnippets(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  // Sync snippets with Monaco completion item providers
  useEffect(() => {
    const monaco = (window as any).monaco;
    if (!monaco) return;

    // Clean up older provider registrations if any
    const providers: any[] = (window as any)._snippetProviders || [];
    providers.forEach(p => p.dispose());
    const newProviders: any[] = [];

    // Group snippets by language
    const langs = Array.from(new Set(snippets.map(s => s.language)));
    
    langs.forEach((lang) => {
      const langSnippets = snippets.filter(s => s.language === lang);
      
      const provider = monaco.languages.registerCompletionItemProvider(lang, {
        provideCompletionItems: (model: any, position: any) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };

          const suggestions = langSnippets.map((s) => ({
            label: s.prefix,
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: s.name,
            insertText: s.body,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range
          }));

          return { suggestions };
        }
      });

      newProviders.push(provider);
    });

    (window as any)._snippetProviders = newProviders;

    return () => {
      // We don't necessarily dispose immediately to keep completions working, 
      // but on next update/unmount we align registrations.
    };
  }, [snippets]);

  const handleAddSnippet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prefix.trim() || !body.trim()) return;

    const newSnippet: Snippet = {
      id: Math.random().toString(36).substring(2, 9),
      name: name.trim(),
      prefix: prefix.trim(),
      body: body.trim(),
      language
    };

    const updated = [...snippets, newSnippet];
    setSnippets(updated);
    localStorage.setItem('cloud-ide-user-snippets', JSON.stringify(updated));

    setName('');
    setPrefix('');
    setBody('');
  };

  const handleDeleteSnippet = (id: string) => {
    const updated = snippets.filter(s => s.id !== id);
    setSnippets(updated);
    localStorage.setItem('cloud-ide-user-snippets', JSON.stringify(updated));
  };

  return (
    <div className="w-full h-full bg-[#1e1e1e] flex flex-col text-xs text-gray-300 font-sans select-none overflow-y-auto p-3">
      {/* Creation form */}
      <form onSubmit={handleAddSnippet} className="flex flex-col space-y-2 pb-3 border-b border-[#3c3c3c] mb-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Snippet Name (e.g. Try-Catch Block)"
            className="bg-[#252526] border border-[#3c3c3c] text-white px-2 py-1 rounded text-[10px] focus:outline-none focus:border-blue-500 flex-1"
          />
          <input
            type="text"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="Prefix (e.g. tryc)"
            className="bg-[#252526] border border-[#3c3c3c] text-white px-2 py-1 rounded text-[10px] focus:outline-none focus:border-blue-500 w-28"
          />
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-[#252526] border border-[#3c3c3c] text-white px-1.5 py-1 rounded text-[10px] focus:outline-none w-24"
          >
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
            <option value="cpp">C++</option>
            <option value="html">HTML</option>
          </select>
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Snippet Body. Use $1, $2 for tab stops. (e.g. try {\n  $1\n} catch (err) {\n  $2\n})"
          rows={3}
          className="bg-[#252526] border border-[#3c3c3c] text-white p-2 rounded text-[10px] font-mono focus:outline-none focus:border-blue-500 w-full"
        />

        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-3 py-1 rounded flex items-center justify-center space-x-1 cursor-pointer transition-colors"
        >
          <Plus size={11} />
          <span>Save Snippet</span>
        </button>
      </form>

      {/* Snippets list */}
      <div className="flex flex-col space-y-1.5">
        {snippets.map((snip) => (
          <div
            key={snip.id}
            className="flex items-start justify-between py-2 px-3 bg-[#252526] border border-[#2d2d2d] rounded"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-gray-200">{snip.name}</span>
                <span className="text-[9px] bg-[#333] text-blue-300 px-1.5 py-0.2 rounded font-mono">
                  {snip.prefix}
                </span>
                <span className="text-[9px] text-gray-500 font-mono">({snip.language})</span>
              </div>
              <pre className="text-gray-400 font-mono text-[9px] mt-1.5 p-1 bg-[#1e1e1e] rounded overflow-x-auto border border-[#2d2d2d]/30 max-h-24">
                {snip.body}
              </pre>
            </div>
            
            <button
              onClick={() => handleDeleteSnippet(snip.id)}
              className="p-1 hover:bg-[#333] rounded text-red-500 hover:text-red-400 ml-2 cursor-pointer transition-colors"
              title="Delete snippet"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
