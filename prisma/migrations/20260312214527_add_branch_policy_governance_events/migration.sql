-- CreateTable
CREATE TABLE "BranchPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "policyType" TEXT NOT NULL,
    "rules" JSONB,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GovernanceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT,
    "details" JSONB,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "BranchPolicy_projectId_idx" ON "BranchPolicy"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchPolicy_projectId_branchName_key" ON "BranchPolicy"("projectId", "branchName");

-- CreateIndex
CREATE INDEX "GovernanceEvent_projectId_timestamp_idx" ON "GovernanceEvent"("projectId", "timestamp");
