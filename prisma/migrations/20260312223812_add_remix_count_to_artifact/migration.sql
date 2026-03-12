-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PublicArtifact" (
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
    "remixCount" INTEGER NOT NULL DEFAULT 0,
    "lastRemixedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PublicArtifact" ("authorId", "branchName", "createdAt", "description", "filesData", "id", "manifest", "name", "previewImage", "projectId", "updatedAt", "version") SELECT "authorId", "branchName", "createdAt", "description", "filesData", "id", "manifest", "name", "previewImage", "projectId", "updatedAt", "version" FROM "PublicArtifact";
DROP TABLE "PublicArtifact";
ALTER TABLE "new_PublicArtifact" RENAME TO "PublicArtifact";
CREATE INDEX "PublicArtifact_projectId_idx" ON "PublicArtifact"("projectId");
CREATE INDEX "PublicArtifact_createdAt_idx" ON "PublicArtifact"("createdAt");
CREATE INDEX "PublicArtifact_remixCount_idx" ON "PublicArtifact"("remixCount");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
