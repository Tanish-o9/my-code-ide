export interface CachedModel {
  path: string;
  model: any; // monaco.editor.ITextModel
  lastAccessed: number;
}

const modelCache = new Map<string, CachedModel>();
const LRU_CAP = 15;

/**
 * Maps common file extensions to Monaco Editor language IDs.
 */
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
    txt: 'plaintext',
  };
  return map[ext] || 'plaintext';
};

/**
 * Retrieves a cached Monaco text model, or creates a new one.
 * Respects LRU cache limits.
 */
export const getOrCreateModel = (monaco: any, filePath: string, content: string): any => {
  const cached = modelCache.get(filePath);
  if (cached) {
    cached.lastAccessed = Date.now();
    return cached.model;
  }

  // Enforce LRU cache limits
  if (modelCache.size >= LRU_CAP) {
    evictOldest();
  }

  const language = getLanguageFromPath(filePath);
  // Format the URI safely to let Monaco parse modules correctly
  const uri = monaco.Uri.parse(`file:///${filePath.replace(/\\/g, '/')}`);

  let model = monaco.editor.getModel(uri);
  if (!model) {
    model = monaco.editor.createModel(content, language, uri);
  } else {
    // If the model exists natively but wasn't in our cache, refresh content
    if (model.getValue() !== content) {
      model.setValue(content);
    }
  }

  modelCache.set(filePath, {
    path: filePath,
    model,
    lastAccessed: Date.now(),
  });

  return model;
};

/**
 * Evicts the least recently used model from memory.
 */
const evictOldest = () => {
  let oldestPath: string | null = null;
  let oldestTime = Infinity;

  for (const [path, record] of modelCache.entries()) {
    if (record.lastAccessed < oldestTime) {
      oldestTime = record.lastAccessed;
      oldestPath = path;
    }
  }

  if (oldestPath) {
    const record = modelCache.get(oldestPath);
    if (record) {
      record.model.dispose();
      modelCache.delete(oldestPath);
      console.log(`[ModelManager] Evicted least-recently-used model: ${oldestPath}`);
    }
  }
};

/**
 * Disposes and evicts a specific model (e.g., when a file is closed or deleted).
 */
export const disposeModel = (filePath: string) => {
  const record = modelCache.get(filePath);
  if (record) {
    record.model.dispose();
    modelCache.delete(filePath);
    console.log(`[ModelManager] Disposed model: ${filePath}`);
  }
};

/**
 * Disposes all models (e.g., on workspace switch or user logout).
 */
export const disposeAllModels = () => {
  for (const record of modelCache.values()) {
    record.model.dispose();
  }
  modelCache.clear();
  console.log('[ModelManager] Cleaned all cached Monaco text models');
};
