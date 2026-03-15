import { describe, it, expect } from "vitest";
import {
  computeTextEmbedding,
  cosineSimilarity,
  kMeans,
  EMBEDDING_DIM,
} from "../embeddings";

describe("computeTextEmbedding", () => {
  it(`produces a vector of length ${EMBEDDING_DIM}`, () => {
    const v = computeTextEmbedding("hello world");
    expect(v).toHaveLength(EMBEDDING_DIM);
  });

  it("produces an L2-normalised vector (norm ≈ 1)", () => {
    const v = computeTextEmbedding("react component with aria labels");
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 3);
  });

  it("is deterministic — same text yields identical vector", () => {
    const a = computeTextEmbedding("Button component");
    const b = computeTextEmbedding("Button component");
    expect(a).toEqual(b);
  });

  it("returns all zeros normalised for empty string (no crash)", () => {
    expect(() => computeTextEmbedding("")).not.toThrow();
  });

  it("different texts produce different vectors", () => {
    const a = computeTextEmbedding("accessible form with aria labels");
    const b = computeTextEmbedding("lazy loaded image gallery performance");
    expect(a).not.toEqual(b);
  });

  it("similar texts score higher similarity than dissimilar texts", () => {
    const base = computeTextEmbedding("aria label accessible button");
    const similar = computeTextEmbedding("aria label accessible input form");
    const dissimilar = computeTextEmbedding("lazy load image optimization performance");
    const simScore = cosineSimilarity(base, similar);
    const diffScore = cosineSimilarity(base, dissimilar);
    expect(simScore).toBeGreaterThan(diffScore);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical unit vectors", () => {
    const v = computeTextEmbedding("hello");
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 4);
  });

  it("returns a value in [-1, 1]", () => {
    const a = computeTextEmbedding("foo bar baz");
    const b = computeTextEmbedding("something completely different xyz");
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it("returns 0 for mismatched dimension arrays", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });
});

describe("kMeans", () => {
  it("returns empty array for empty input", () => {
    expect(kMeans([], 3)).toHaveLength(0);
  });

  it("returns at most k clusters", () => {
    const points = [
      { id: "a", vector: computeTextEmbedding("accessible aria button") },
      { id: "b", vector: computeTextEmbedding("aria label form accessible") },
      { id: "c", vector: computeTextEmbedding("lazy load performance optimize") },
      { id: "d", vector: computeTextEmbedding("animation hover transition ux") },
    ];
    const clusters = kMeans(points, 3);
    expect(clusters.length).toBeLessThanOrEqual(3);
  });

  it("assigns every point to exactly one cluster", () => {
    const points = [
      { id: "a", vector: computeTextEmbedding("button aria") },
      { id: "b", vector: computeTextEmbedding("input label") },
      { id: "c", vector: computeTextEmbedding("lazy image") },
    ];
    const clusters = kMeans(points, 2);
    const allMembers = clusters.flatMap((c) => c.members);
    expect(allMembers.sort()).toEqual(["a", "b", "c"].sort());
  });

  it("caps k at the number of points", () => {
    const points = [
      { id: "x", vector: computeTextEmbedding("foo") },
      { id: "y", vector: computeTextEmbedding("bar") },
    ];
    const clusters = kMeans(points, 10);
    expect(clusters.length).toBeLessThanOrEqual(2);
  });

  it("cluster centroids are unit vectors", () => {
    const points = [
      { id: "a", vector: computeTextEmbedding("accessible") },
      { id: "b", vector: computeTextEmbedding("performance") },
    ];
    const clusters = kMeans(points, 2);
    for (const c of clusters) {
      const norm = Math.sqrt(c.centroid.reduce((s, v) => s + v * v, 0));
      if (c.members.length > 0) expect(norm).toBeCloseTo(1, 3);
    }
  });
});
