-- AlterTable: add cross-repo fields to ArtifactRelation
ALTER TABLE "ArtifactRelation" ADD COLUMN "externalRepoId" TEXT;
ALTER TABLE "ArtifactRelation" ADD COLUMN "externalArtifactUrl" TEXT;

-- CreateIndex on externalRepoId
CREATE INDEX "ArtifactRelation_externalRepoId_idx" ON "ArtifactRelation"("externalRepoId");

-- CreateTable: ExternalRepo
CREATE TABLE "ExternalRepo" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "apiKey" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalRepo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalRepo_url_key" ON "ExternalRepo"("url");
