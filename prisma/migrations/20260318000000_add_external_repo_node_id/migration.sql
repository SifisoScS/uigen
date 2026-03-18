-- Phase 40: Add nodeId to ExternalRepo for Mesh Node Identity (§13)
-- Stores the DID of the remote node, populated after a successful /mesh/handshake
ALTER TABLE "ExternalRepo" ADD COLUMN "nodeId" TEXT;
