/**
 * UIGen Node Identity (§22.4 — Phase 49).
 *
 * Generates and exposes a persistent Ed25519 keypair so UIGen participates as
 * a sovereign node in the Mesh — replacing the "stub-phase-44" handshake sig.
 *
 * Constitutional rules (§22.4):
 *  - UIGen MUST NOT send a stub signature after Phase 49.
 *  - Canonical handshake payload: "{uigen_did}:{timestamp}"
 *  - DID format: "did:key:z_uigen_{first 32 hex chars of publicKey}"
 *
 * Key persistence:
 *  - UIGEN_PRIVATE_KEY_HEX env var (64-char hex) → deterministic across restarts
 *  - Absent → ephemeral key (fine for dev/test; NOT suitable for multi-node production)
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
} from "crypto";

// ── DER encoding prefixes for Ed25519 ─────────────────────────────────────────

/** SubjectPublicKeyInfo DER prefix for Ed25519 (RFC 8410). */
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** PKCS#8 DER prefix for Ed25519 private key (RFC 8410). */
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UIGenIdentity {
  /** DID of this UIGen node: "did:key:z_uigen_{first 32 hex chars of publicKey}" */
  did: string;
  /** 64-char hex Ed25519 public key. */
  publicKeyHex: string;
  /**
   * Sign a canonical UTF-8 payload; returns 128-char hex Ed25519 signature.
   * Canonical handshake payload: "{did}:{timestamp}"
   */
  sign(payload: string): string;
}

// ── Module singleton ──────────────────────────────────────────────────────────

let _identity: UIGenIdentity | null = null;

/**
 * Return (or lazily create) the UIGen node identity.
 * Safe to call multiple times — returns the same instance.
 */
export function getUIGenIdentity(): UIGenIdentity {
  if (_identity) return _identity;
  const privateKeyHex = process.env.UIGEN_PRIVATE_KEY_HEX;
  _identity =
    privateKeyHex && privateKeyHex.length === 64
      ? _identityFromHex(privateKeyHex)
      : _generateIdentity();
  return _identity;
}

/** Reset singleton — for test isolation only. */
export function _resetUIGenIdentity(): void {
  _identity = null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _rawPublicKeyFrom(publicKey: ReturnType<typeof createPublicKey>): Buffer {
  const spkiDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  return spkiDer.slice(SPKI_PREFIX.length);
}

function _makeDid(publicKeyHex: string): string {
  return `did:key:z_uigen_${publicKeyHex.slice(0, 32)}`;
}

function _generateIdentity(): UIGenIdentity {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const rawPublic = _rawPublicKeyFrom(publicKey);
  const publicKeyHex = rawPublic.toString("hex");
  const did = _makeDid(publicKeyHex);

  return {
    did,
    publicKeyHex,
    sign(payload: string): string {
      const sig = cryptoSign(null, Buffer.from(payload, "utf-8"), privateKey) as Buffer;
      return sig.toString("hex");
    },
  };
}

function _identityFromHex(privateKeyHex: string): UIGenIdentity {
  const raw = Buffer.from(privateKeyHex, "hex");
  const pkcs8Der = Buffer.concat([PKCS8_PREFIX, raw]);
  const privateKey = createPrivateKey({ key: pkcs8Der, format: "der", type: "pkcs8" });
  const publicKey = createPublicKey(privateKey);
  const rawPublic = _rawPublicKeyFrom(publicKey);
  const publicKeyHex = rawPublic.toString("hex");
  const did = _makeDid(publicKeyHex);

  return {
    did,
    publicKeyHex,
    sign(payload: string): string {
      const sig = cryptoSign(null, Buffer.from(payload, "utf-8"), privateKey) as Buffer;
      return sig.toString("hex");
    },
  };
}
