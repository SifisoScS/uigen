-- AlterTable: add descendantCount and descendantMetrics to PublicArtifact
ALTER TABLE "PublicArtifact" ADD COLUMN "descendantCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PublicArtifact" ADD COLUMN "descendantMetrics" JSONB;
