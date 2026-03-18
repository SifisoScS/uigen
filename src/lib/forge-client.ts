/**
 * Remote Forge Runner client (§20 — Phase 47).
 *
 * Typed HTTP call to:
 *   POST {baseUrl}/mesh/forge/run — execute a ForgeTask, return signed BuildReceipt
 */

import type { BuildReceipt, ForgeTask } from "@/lib/mesh-client";

/**
 * POST /mesh/forge/run — execute a ForgeTask on a remote Mesh node (§20.2).
 *
 * The returned BuildReceipt must be verified by the caller (§20.3 Rule 6).
 *
 * @param baseUrl - Remote Mesh node URL
 * @param task    - The ForgeTask to execute
 * @param signal  - Optional AbortSignal
 * @throws Error on non-2xx response or network failure
 */
export async function runForgeTask(
  baseUrl: string,
  task: ForgeTask,
  signal?: AbortSignal
): Promise<BuildReceipt> {
  const url = `${baseUrl.replace(/\/+$/, "")}/mesh/forge/run`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(task),
    signal,
  });
  if (!res.ok) {
    throw new Error(`Forge run failed: ${res.status} from ${url}`);
  }
  return (await res.json()) as BuildReceipt;
}
