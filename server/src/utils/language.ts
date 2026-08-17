export const getLanguageFromPath = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    json: 'json',
    html: 'html',
    css: 'css',
    md: 'markdown',
    xml: 'xml',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'shell',
    bash: 'shell',
    bat: 'bat',
    sql: 'sql',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'cpp',
    hpp: 'cpp',
    java: 'java',
    c: 'c',
    go: 'go',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    txt: 'plaintext',
  };
  return map[ext] || 'plaintext';
};
