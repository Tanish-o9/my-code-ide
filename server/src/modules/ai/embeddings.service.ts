import fs from 'fs';
import path from 'path';
import { Workspace } from '../workspaces/workspace.model';
import { AICredential } from './ai.model';
import { decrypt } from '../../utils/crypto';

interface TextChunk {
  filePath: string;
  text: string;
  embedding: number[];
}

export class EmbeddingsService {
  private static cache = new Map<string, TextChunk[]>();

  private static getCachePath(workspaceId: string): string {
    const dir = path.join(process.env.APPDATA || (process.platform === 'darwin' ? `${process.env.HOME}/Library/Preferences` : '/var/tmp'), 'gemini-ide', 'embeddings');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `${workspaceId}.json`);
  }

  public static async indexWorkspace(workspaceId: string): Promise<void> {
    try {
      const workspace = await Workspace.findById(workspaceId);
      if (!workspace) return;

      const cacheFile = this.getCachePath(workspaceId);
      if (fs.existsSync(cacheFile)) {
        try {
          const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
          this.cache.set(workspaceId, cached);
          console.log(`[EmbeddingsService] Loaded ${cached.length} indexed chunks from cache.`);
          return;
        } catch {}
      }

      console.log(`[EmbeddingsService] Scanning and indexing workspace ${workspaceId}...`);
      const files = this.walkDir(workspace.storagePath);
      const chunks: TextChunk[] = [];

      const credential = await AICredential.findOne({ workspaceId });
      const apiKey = credential ? decrypt(credential.apiKey) : '';

      for (const file of files) {
        try {
          const content = fs.readFileSync(file, 'utf8');
          const relPath = path.relative(workspace.storagePath, file).replace(/\\/g, '/');
          
          // Split file content into chunks (approx 500 chars with overlap)
          const fileChunks = this.chunkText(content, 500, 100);
          for (const chunkText of fileChunks) {
            const embedding = await this.getEmbedding(chunkText, apiKey);
            chunks.push({
              filePath: relPath,
              text: chunkText,
              embedding
            });
          }
        } catch {}
      }

      this.cache.set(workspaceId, chunks);
      fs.writeFileSync(cacheFile, JSON.stringify(chunks), 'utf8');
      console.log(`[EmbeddingsService] Indexing complete: ${chunks.length} chunks generated.`);
    } catch (err) {
      console.error('[EmbeddingsService] Indexing failed:', err);
    }
  }

  public static async search(workspaceId: string, query: string, limit = 5): Promise<TextChunk[]> {
    let chunks = this.cache.get(workspaceId);
    if (!chunks) {
      await this.indexWorkspace(workspaceId);
      chunks = this.cache.get(workspaceId) || [];
    }

    if (chunks.length === 0) return [];

    const credential = await AICredential.findOne({ workspaceId });
    const apiKey = credential ? decrypt(credential.apiKey) : '';
    
    const queryEmbedding = await this.getEmbedding(query, apiKey);

    // Compute cosine similarity and sort
    const scored = chunks.map((chunk) => {
      const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      return { chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.chunk);
  }

  private static async getEmbedding(text: string, apiKey: string): Promise<number[]> {
    if (!apiKey || apiKey === 'mock-key') {
      // Fallback: Generate mock embedding based on character hashes (always same length 1536)
      const mockVector: number[] = new Array(1536).fill(0);
      for (let i = 0; i < text.length; i++) {
        const idx = (text.charCodeAt(i) * (i + 1)) % 1536;
        mockVector[idx] += 1;
      }
      // Normalize
      const magnitude = Math.sqrt(mockVector.reduce((sum, val) => sum + val * val, 0)) || 1;
      return mockVector.map((val) => val / magnitude);
    }

    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          input: text,
          model: 'text-embedding-ada-002'
        })
      });
      const data = await res.json() as any;
      if (data.data && data.data[0] && data.data[0].embedding) {
        return data.data[0].embedding;
      }
    } catch {}

    // Fallback if API fails
    return new Array(1536).fill(0).map(() => Math.random());
  }

  private static cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }

  private static walkDir(dir: string): string[] {
    const list: string[] = [];
    const files = fs.readdirSync(dir);
    
    const skipList = ['.git', 'node_modules', 'dist', '.venv', 'venv', 'env', '.gemini', 'package-lock.json'];

    for (const file of files) {
      if (skipList.includes(file)) continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        list.push(...this.walkDir(fullPath));
      } else {
        const ext = path.extname(file).toLowerCase();
        const supported = ['.py', '.js', '.jsx', '.ts', '.tsx', '.cpp', '.c', '.h', '.hpp', '.go', '.rs', '.java', '.php', '.html', '.css', '.md'];
        if (supported.includes(ext)) {
          list.push(fullPath);
        }
      }
    }
    return list;
  }

  private static chunkText(text: string, size: number, overlap: number): string[] {
    const chunks: string[] = [];
    let idx = 0;
    while (idx < text.length) {
      chunks.push(text.substring(idx, idx + size));
      idx += (size - overlap);
    }
    return chunks;
  }
}
