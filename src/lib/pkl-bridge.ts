/**
 * PKL Bridge — Phase 37
 *
 * Typed client for writing presence observations to iKhaya AI's PKL
 * via Sifiso OS POST /api/ikhaya/observe.
 *
 * Design invariant: fail-open at every layer.  A PKL write must never block,
 * throw, or surface an error to the caller.  If SIFISO_OS_URL is absent or
 * unreachable, the call silently no-ops.
 *
 * Category conventions:
 *   "uigen"    — critique, variant, evaluation, publish events from UIGen
 *   "forge"    — build, mesh, lineage events from The Forge
 *   "presence" — generic iKhaya presence observations (default)
 */

export interface PKLObservation {
  /** Structured key for the observation — format: "{namespace}:{event}:{id}" */
  key: string;
  /** Typed payload stored in PKL. */
  value: Record<string, unknown>;
  /** PKL category namespace. Defaults to "presence". */
  category?: string;
}

/**
 * Write a presence observation to iKhaya's PKL via Sifiso OS.
 *
 * Silently no-ops when:
 *   - SIFISO_OS_URL is not set
 *   - The HTTP request fails (network error, timeout, non-2xx)
 *   - Any other error occurs
 *
 * @example
 * await writePresenceObservation({
 *   key: "uigen:critique_completed:art-123",
 *   value: { event_type: "critique_completed", artifact_id: "art-123", agent_count: 2 },
 *   category: "uigen",
 * });
 */
export async function writePresenceObservation(
  obs: PKLObservation
): Promise<void> {
  try {
    const base = process.env.SIFISO_OS_URL;
    if (!base) return; // fail-open — not configured in development

    const res = await fetch(`${base.replace(/\/+$/, "")}/api/ikhaya/observe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: obs.key,
        value: obs.value,
        category: obs.category ?? "presence",
      }),
    });

    // Non-ok responses are silently swallowed — PKL writes must not block flows
    if (!res.ok) return;
  } catch {
    // Network errors, timeouts, JSON errors — all silently ignored
  }
}
