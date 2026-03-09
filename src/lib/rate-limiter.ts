const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20; // per identifier per window

const store = new Map<string, number[]>();

export function checkRateLimit(identifier: string): {
  allowed: boolean;
  retryAfterMs?: number;
} {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const timestamps = (store.get(identifier) ?? []).filter(
    (t) => t > windowStart
  );

  if (timestamps.length >= MAX_REQUESTS) {
    const retryAfterMs = timestamps[0] + WINDOW_MS - now;
    return { allowed: false, retryAfterMs };
  }

  timestamps.push(now);
  store.set(identifier, timestamps);
  return { allowed: true };
}
