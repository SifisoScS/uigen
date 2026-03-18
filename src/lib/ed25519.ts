/**
 * Ed25519 signature verification (§17 — Phase 44).
 *
 * Uses Node.js built-in `crypto` — no additional dependencies.
 *
 * Canonical payload formats (§17.2):
 *   Handshake: "{node_did}:{timestamp}"
 *   Artifact:  "{artifact_id}:{content_hash}"
 *   LineageHop:"{node_did}:{mesh_id}:{timestamp}"
 */

import { createPublicKey, verify as cryptoVerify } from "crypto";

// DER prefix for Ed25519 SubjectPublicKeyInfo (RFC 8410) — 12 bytes
// Hex: 302a300506032b6570032100
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Verify an Ed25519 signature.
 *
 * @param signatureHex - 128-char lowercase hex (64 bytes)
 * @param payload      - UTF-8 canonical string that was signed
 * @param publicKeyHex - 64-char lowercase hex (32 bytes)
 * @returns true if valid, false on any failure (never throws)
 */
export function verifyEd25519(
  signatureHex: string,
  payload: string,
  publicKeyHex: string
): boolean {
  try {
    const rawKey = Buffer.from(publicKeyHex, "hex");
    const derKey = Buffer.concat([SPKI_PREFIX, rawKey]);
    const publicKey = createPublicKey({ key: derKey, format: "der", type: "spki" });
    return cryptoVerify(
      null,
      Buffer.from(payload, "utf-8"),
      publicKey,
      Buffer.from(signatureHex, "hex")
    );
  } catch {
    return false;
  }
}
