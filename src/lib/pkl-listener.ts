/**
 * PKL Presence Listener — Phase 38
 *
 * Polls iKhaya's PKL observation log on a 60-second interval and routes
 * new entries to `initiateFromPresence` for proactive action.
 *
 * Design invariants:
 *   - Fail-open: absent SIFISO_OS_URL → silent no-op
 *   - Fail-open: network/parse errors → silently ignored
 *   - Each observation is processed independently (one failure ≠ skip rest)
 *   - `pollOnce` is exported for testing and manual invocation
 *   - Only one listener interval may be active at a time
 */

import { initiateFromPresence } from "@/actions/initiate-from-presence";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PKLObservationEntry {
  id?: string;
  key?: string;
  value?: Record<string, unknown>;
  category?: string;
  event_type?: string;
  artifact_id?: string;
  status?: string;
  agent_count?: number;
  timestamp?: number;
  [key: string]: unknown;
}

// ── Module state ──────────────────────────────────────────────────────────────

let _interval: ReturnType<typeof setInterval> | null = null;
let _lastPoll: number = Date.now();

// ── Core polling function (exported for testing) ───────────────────────────────

/**
 * Fetch observations written since the last poll and initiate actions for each.
 * Updates the internal `_lastPoll` cursor before the fetch to avoid gaps.
 */
export async function pollOnce(): Promise<void> {
  try {
    const base = process.env.SIFISO_OS_URL;
    if (!base) return; // fail-open — not configured

    const since = _lastPoll;
    _lastPoll = Date.now();

    const url = `${base.replace(/\/+$/, "")}/api/pkl/observations?category=uigen&since=${since}`;
    const res = await fetch(url);
    if (!res.ok) return;

    const observations = (await res.json()) as unknown;
    if (!Array.isArray(observations)) return;

    for (const obs of observations as PKLObservationEntry[]) {
      // Flatten value fields into top-level for initiateFromPresence
      const flat: Record<string, unknown> = {
        ...obs,
        ...(obs.value ?? {}),
      };
      await initiateFromPresence(flat).catch(() => {}); // fail-open per entry
    }
  } catch {
    // Network errors, JSON parse failures — silently ignored
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/**
 * Start the presence listener.
 * Safe to call multiple times — subsequent calls are no-ops if already running.
 *
 * @param intervalMs  Poll interval in milliseconds (default: 60 000)
 */
export function startPresenceListener(intervalMs = 60_000): void {
  if (_interval !== null) return; // already running
  _interval = setInterval(() => {
    void pollOnce();
  }, intervalMs);
}

/**
 * Stop the presence listener and clear internal state.
 * Safe to call when the listener is not running.
 */
export function stopPresenceListener(): void {
  if (_interval !== null) {
    clearInterval(_interval);
    _interval = null;
  }
}
