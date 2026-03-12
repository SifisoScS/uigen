-- AlterTable
ALTER TABLE "Project" ADD COLUMN "remixedFromArtifactId" TEXT;

-- AlterTable
ALTER TABLE "PublicArtifact" ADD COLUMN "parentArtifactId" TEXT;

-- CreateIndex
CREATE INDEX "PublicArtifact_parentArtifactId_idx" ON "PublicArtifact"("parentArtifactId");
