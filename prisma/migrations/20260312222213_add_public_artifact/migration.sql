-- CreateTable
CREATE TABLE "PublicArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "manifest" JSONB NOT NULL,
    "filesData" TEXT NOT NULL,
    "previewImage" TEXT,
    "authorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "PublicArtifact_projectId_idx" ON "PublicArtifact"("projectId");

-- CreateIndex
CREATE INDEX "PublicArtifact_createdAt_idx" ON "PublicArtifact"("createdAt");
