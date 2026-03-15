/**
 * Text embedding utilities for UIGen's semantic search.
 *
 * PRODUCTION NOTE: Replace `computeTextEmbedding` with a real embedding API
 * call (e.g. OpenAI `text-embedding-3-small`, Cohere `embed-english-v3`,
 * or any 64-1536 dim model) by swapping the body of that function.
 * The rest of the module (cosineSimilarity, kMeans) is model-agnostic.
 */

export const EMBEDDING_DIM = 64;
export const MODEL_VERSION = "stub-v1";

// ── Embedding computation ─────────────────────────────────────────────────────

/**
 * Produce a deterministic L2-normalised `EMBEDDING_DIM`-dimensional vector
 * from `text` using character-trigram frequency bucketing.
 *
 * This stub is reproducible and has reasonable locality properties for
 * testing — semantically similar texts share trigrams and cluster together.
 * Swap for a real API call when you have an embedding service available.
 */
export function computeTextEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const normalised = text.toLowerCase().replace(/\s+/g, " ").trim();

  // Bigrams + trigrams for better locality
  for (let n = 2; n <= 3; n++) {
    for (let i = 0; i <= normalised.length - n; i++) {
      const gram = normalised.slice(i, i + n);
      let h = 5381;
      for (let j = 0; j < gram.length; j++) {
        h = ((h << 5) + h + gram.charCodeAt(j)) & 0xffffffff;
      }
      vec[((h >>> 0) % EMBEDDING_DIM)] += 1;
    }
  }

  // L2 normalise so cosine similarity == dot product
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => parseFloat((v / norm).toFixed(6)));
}

// ── Similarity & search ───────────────────────────────────────────────────────

/**
 * Cosine similarity between two L2-normalised vectors.
 * For unit vectors this equals the dot product (range: -1 to 1).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.min(1, Math.max(-1, dot));
}

// ── K-means clustering ────────────────────────────────────────────────────────

export interface ClusterPoint {
  id: string;
  vector: number[];
}

export interface ClusterResult {
  clusterId: number;
  centroid: number[];
  members: string[]; // artifact ids
}

/**
 * Simple Lloyd's k-means algorithm.  Converges in ≤ `maxIter` iterations.
 * Distance metric: 1 - cosineSimilarity (so cosine dissimilarity).
 */
export function kMeans(
  points: ClusterPoint[],
  k: number,
  maxIter = 20
): ClusterResult[] {
  if (points.length === 0 || k <= 0) return [];
  const clampedK = Math.min(k, points.length);

  // Initialise centroids by picking k evenly spaced points
  const step = Math.floor(points.length / clampedK);
  let centroids: number[][] = Array.from(
    { length: clampedK },
    (_, i) => [...points[i * step].vector]
  );

  let assignments: number[] = new Array(points.length).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign each point to nearest centroid
    const newAssignments = points.map((p) => {
      let best = 0;
      let bestSim = -Infinity;
      for (let c = 0; c < clampedK; c++) {
        const sim = cosineSimilarity(p.vector, centroids[c]);
        if (sim > bestSim) { bestSim = sim; best = c; }
      }
      return best;
    });

    // Check convergence
    const converged = newAssignments.every((a, i) => a === assignments[i]);
    assignments = newAssignments;
    if (converged) break;

    // Recompute centroids
    centroids = Array.from({ length: clampedK }, (_, c) => {
      const members = points.filter((_, i) => assignments[i] === c);
      if (members.length === 0) return centroids[c]; // keep old centroid
      const sum = new Array<number>(EMBEDDING_DIM).fill(0);
      for (const m of members) m.vector.forEach((v, j) => (sum[j] += v));
      const norm = Math.sqrt(sum.reduce((s, v) => s + v * v, 0)) || 1;
      return sum.map((v) => v / norm);
    });
  }

  // Build result
  return Array.from({ length: clampedK }, (_, c) => ({
    clusterId: c,
    centroid: centroids[c],
    members: points.filter((_, i) => assignments[i] === c).map((p) => p.id),
  }));
}
