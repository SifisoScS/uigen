-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProjectSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "name" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "branchName" TEXT,
    "isVersionTag" BOOLEAN NOT NULL DEFAULT false,
    "mergedFromSnapshotId" TEXT,
    "messages" TEXT NOT NULL DEFAULT '[]',
    "data" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectSnapshot_mergedFromSnapshotId_fkey" FOREIGN KEY ("mergedFromSnapshotId") REFERENCES "ProjectSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProjectSnapshot" ("createdAt", "data", "id", "label", "messages", "name", "pinned", "projectId", "tags") SELECT "createdAt", "data", "id", "label", "messages", "name", "pinned", "projectId", "tags" FROM "ProjectSnapshot";
DROP TABLE "ProjectSnapshot";
ALTER TABLE "new_ProjectSnapshot" RENAME TO "ProjectSnapshot";
CREATE INDEX "ProjectSnapshot_projectId_idx" ON "ProjectSnapshot"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
