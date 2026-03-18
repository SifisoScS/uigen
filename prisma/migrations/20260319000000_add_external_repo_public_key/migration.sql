-- Phase 44: Add Ed25519 public key field to ExternalRepo (§17)
ALTER TABLE "ExternalRepo" ADD COLUMN "publicKey" TEXT;
