-- AlterTable
ALTER TABLE "Project" ADD COLUMN "agentName" TEXT;

-- CreateTable
CREATE TABLE "AgentReputation" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "approvedCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentReputation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentReputation_agentName_key" ON "AgentReputation"("agentName");

-- CreateIndex
CREATE INDEX "AgentReputation_score_idx" ON "AgentReputation"("score");
