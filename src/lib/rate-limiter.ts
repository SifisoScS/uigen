const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_REQUESTS = 20; // per identifier per window

const store = new Map<string, number[]>();

export function checkRateLimit(
  identifier: string,
  {
    windowMs = DEFAULT_WINDOW_MS,
    maxRequests = DEFAULT_MAX_REQUESTS,
  }: { windowMs?: number; maxRequests?: number } = {}
): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  const timestamps = (store.get(identifier) ?? []).filter(
    (t) => t > windowStart
  );

  if (timestamps.length >= maxRequests) {
    const retryAfterMs = timestamps[0] + windowMs - now;
    return { allowed: false, retryAfterMs };
  }

  timestamps.push(now);
  store.set(identifier, timestamps);
  return { allowed: true };
}
