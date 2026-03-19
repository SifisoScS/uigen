import { describe, it, expect, afterEach } from "vitest";
import { _resetUIGenIdentity, getUIGenIdentity } from "@/lib/uigen-identity";
import { verifyEd25519 } from "@/lib/ed25519";

afterEach(() => {
  _resetUIGenIdentity();
  delete process.env.UIGEN_PRIVATE_KEY_HEX;
});

describe("getUIGenIdentity", () => {
  it("returns an identity with valid DID, 64-char hex publicKey, and 128-char signature", () => {
    const identity = getUIGenIdentity();
    expect(identity.did).toMatch(/^did:key:z_uigen_[0-9a-f]{32}$/);
    expect(identity.publicKeyHex).toHaveLength(64);
    const sig = identity.sign(`${identity.did}:1700000000`);
    expect(sig).toHaveLength(128);
  });

  it("generated signature verifies with verifyEd25519", () => {
    const identity = getUIGenIdentity();
    const payload = `${identity.did}:1700000001`;
    const sig = identity.sign(payload);
    expect(verifyEd25519(sig, payload, identity.publicKeyHex)).toBe(true);
  });

  it("returns the same singleton instance on repeated calls", () => {
    const a = getUIGenIdentity();
    const b = getUIGenIdentity();
    expect(a.did).toBe(b.did);
    expect(a.publicKeyHex).toBe(b.publicKeyHex);
  });

  it("uses UIGEN_PRIVATE_KEY_HEX env var for deterministic identity across restarts", () => {
    // Use a fixed 64-char hex private key (exactly 32 bytes = 64 hex chars)
    const FIXED_KEY = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
    expect(FIXED_KEY.length).toBe(64); // guard
    process.env.UIGEN_PRIVATE_KEY_HEX = FIXED_KEY;
    const identity = getUIGenIdentity();
    // Reset and recreate — same env var → same identity
    _resetUIGenIdentity();
    delete process.env.UIGEN_PRIVATE_KEY_HEX;
    process.env.UIGEN_PRIVATE_KEY_HEX = FIXED_KEY;
    const identity2 = getUIGenIdentity();
    expect(identity.did).toBe(identity2.did);
    expect(identity.publicKeyHex).toBe(identity2.publicKeyHex);
  });
});
