// Embedding generation for LMF4 semantic search.
// Uses Ollama for nomic-embed-text embeddings when available.
// Defaults to localhost:11434; override with OLLAMA_URL env var.
// If Ollama isn't running, semantic search gracefully degrades —
// keyword (FTS5) search still works and callers check checkEmbeddingService().

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const EMBEDDING_DIMENSIONS = 768;

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
}

/**
 * Generate embedding for text using Ollama (local, optional).
 */
export async function embed(text: string): Promise<EmbeddingResult> {
  // Truncate very long text (nomic-embed-text has 8192 token context)
  const truncated = text.slice(0, 30000); // ~8K tokens rough estimate

  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      prompt: truncated
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { embedding: number[] };

  if (!data.embedding || !Array.isArray(data.embedding)) {
    throw new Error('Invalid embedding response from Ollama');
  }

  return {
    embedding: data.embedding,
    model: EMBEDDING_MODEL,
    dimensions: data.embedding.length
  };
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function embedBatch(texts: string[], onProgress?: (done: number, total: number) => void): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = [];

  for (let i = 0; i < texts.length; i++) {
    try {
      const result = await embed(texts[i]);
      results.push(result);
    } catch (err) {
      console.error(`Failed to embed text ${i}:`, err);
      // Push null embedding on failure
      results.push({
        embedding: [],
        model: EMBEDDING_MODEL,
        dimensions: 0
      });
    }

    if (onProgress) {
      onProgress(i + 1, texts.length);
    }
  }

  return results;
}

/**
 * Convert embedding array to SQLite BLOB format
 */
export function embeddingToBlob(embedding: number[]): Buffer {
  const buffer = Buffer.alloc(embedding.length * 4); // float32 = 4 bytes
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }
  return buffer;
}

/**
 * Convert SQLite BLOB back to embedding array
 */
export function blobToEmbedding(blob: Buffer | Uint8Array): number[] {
  const buf = blob instanceof Buffer ? blob : Buffer.from(blob);
  const embedding: number[] = [];
  for (let i = 0; i < buf.length; i += 4) {
    embedding.push(buf.readFloatLE(i));
  }
  return embedding;
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Check if Ollama embedding service is available
 */
export async function checkEmbeddingService(): Promise<{ available: boolean; model: string; url: string }> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) {
      return { available: false, model: EMBEDDING_MODEL, url: OLLAMA_URL };
    }

    const data = await response.json() as { models?: Array<{ name: string }> };
    const hasModel = data.models?.some(m => m.name.startsWith(EMBEDDING_MODEL)) ?? false;

    return { available: hasModel, model: EMBEDDING_MODEL, url: OLLAMA_URL };
  } catch {
    return { available: false, model: EMBEDDING_MODEL, url: OLLAMA_URL };
  }
}

/**
 * Reciprocal Rank Fusion (RRF) for combining search results
 * Formula: score(d) = Σ 1/(k + rank_i(d))
 * k=60 is standard, provides good balance between top and lower ranks
 */
export function reciprocalRankFusion(
  rankedLists: Array<Array<{ id: string; score?: number }>>,
  k: number = 60
): Map<string, number> {
  const fusedScores = new Map<string, number>();

  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank];
      const rrfScore = 1 / (k + rank + 1); // rank is 0-indexed, so +1
      const current = fusedScores.get(item.id) || 0;
      fusedScores.set(item.id, current + rrfScore);
    }
  }

  return fusedScores;
}

export { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, OLLAMA_URL };
