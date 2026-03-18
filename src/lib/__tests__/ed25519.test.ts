import { generateKeyPairSync, sign } from "crypto";
import { describe, it, expect } from "vitest";
import { verifyEd25519 } from "../ed25519";

// DER prefix for Ed25519 SubjectPublicKeyInfo (RFC 8410) — must match ed25519.ts
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Generate a real Ed25519 keypair and sign a payload.
 * Returns { publicKeyHex, signatureHex }.
 */
function signPayload(payload: string): { publicKeyHex: string; signatureHex: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  // Extract the raw 32-byte public key from the DER-encoded SPKI key
  const derBuf = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  const rawPub = derBuf.subarray(SPKI_PREFIX.length);
  const publicKeyHex = rawPub.toString("hex");

  const sigBuf = sign(null, Buffer.from(payload, "utf-8"), privateKey) as Buffer;
  const signatureHex = sigBuf.toString("hex");

  return { publicKeyHex, signatureHex };
}

describe("verifyEd25519", () => {
  it("returns true for a valid signature", () => {
    const payload = "did:key:zabc:1700000000";
    const { publicKeyHex, signatureHex } = signPayload(payload);
    expect(verifyEd25519(signatureHex, payload, publicKeyHex)).toBe(true);
  });

  it("returns false for a tampered payload (signature mismatch)", () => {
    const payload = "did:key:zabc:1700000000";
    const { publicKeyHex, signatureHex } = signPayload(payload);
    // Tamper the payload — the signature is now wrong
    expect(verifyEd25519(signatureHex, "did:key:zabc:9999999999", publicKeyHex)).toBe(false);
  });

  it("returns false when the wrong public key is used", () => {
    const payload = "mesh:art-001:deadbeef";
    const { signatureHex } = signPayload(payload);
    // Generate a different keypair — public key doesn't match signer
    const { publicKeyHex: wrongPubHex } = signPayload("other");
    expect(verifyEd25519(signatureHex, payload, wrongPubHex)).toBe(false);
  });

  it("returns false (no throw) for invalid hex inputs", () => {
    expect(verifyEd25519("not-hex", "payload", "also-not-hex")).toBe(false);
    expect(verifyEd25519("", "payload", "")).toBe(false);
    expect(verifyEd25519("aa".repeat(64), "payload", "zz".repeat(32))).toBe(false);
  });
});
