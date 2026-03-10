import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRateLimit } from "../rate-limiter";

// The store is module-scoped; use unique keys per test to avoid cross-test
// pollution. For window-expiry tests we mock Date.now().

describe("checkRateLimit", () => {
  let startTime: number;

  beforeEach(() => {
    startTime = 1_000_000;
    vi.spyOn(Date, "now").mockReturnValue(startTime);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows the first request", () => {
    const result = checkRateLimit("rl-first");
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBeUndefined();
  });

  it("allows requests up to the limit (20)", () => {
    const key = "rl-upto-limit";
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(key).allowed).toBe(true);
    }
  });

  it("blocks the 21st request within the same window", () => {
    const key = "rl-block-21st";
    for (let i = 0; i < 20; i++) {
      checkRateLimit(key);
    }
    const result = checkRateLimit(key);
    expect(result.allowed).toBe(false);
  });

  it("includes retryAfterMs when blocked", () => {
    const key = "rl-retry-after";
    for (let i = 0; i < 20; i++) {
      checkRateLimit(key);
    }
    const result = checkRateLimit(key);
    expect(result.retryAfterMs).toBeDefined();
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("allows requests again after the 1-minute window expires", () => {
    const key = "rl-expire";
    for (let i = 0; i < 20; i++) {
      checkRateLimit(key);
    }
    expect(checkRateLimit(key).allowed).toBe(false);

    // Advance time past the window — all previous timestamps become stale
    vi.spyOn(Date, "now").mockReturnValue(startTime + 61_000);

    expect(checkRateLimit(key).allowed).toBe(true);
  });

  it("slides the window — old timestamps expire while new ones accumulate", () => {
    const key = "rl-sliding";
    // Fill 19 slots at t=0
    for (let i = 0; i < 19; i++) {
      checkRateLimit(key);
    }
    // Move past the window so all 19 expire
    vi.spyOn(Date, "now").mockReturnValue(startTime + 61_000);

    // Should now allow another 20
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(key).allowed).toBe(true);
    }
    expect(checkRateLimit(key).allowed).toBe(false);
  });

  it("tracks different identifiers independently", () => {
    const keyA = "rl-ind-a";
    const keyB = "rl-ind-b";
    for (let i = 0; i < 20; i++) {
      checkRateLimit(keyA);
    }
    expect(checkRateLimit(keyA).allowed).toBe(false);
    expect(checkRateLimit(keyB).allowed).toBe(true);
  });

  it("respects custom windowMs option", () => {
    const key = "rl-custom-window";
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, { windowMs: 30_000, maxRequests: 5 });
    }
    // Blocked within 30s window
    expect(
      checkRateLimit(key, { windowMs: 30_000, maxRequests: 5 }).allowed
    ).toBe(false);

    // Advance 31s — should be allowed again
    vi.spyOn(Date, "now").mockReturnValue(startTime + 31_000);
    expect(
      checkRateLimit(key, { windowMs: 30_000, maxRequests: 5 }).allowed
    ).toBe(true);
  });

  it("respects custom maxRequests option", () => {
    const key = "rl-custom-max";
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, { maxRequests: 3 });
    }
    expect(checkRateLimit(key, { maxRequests: 3 }).allowed).toBe(false);
  });
});
