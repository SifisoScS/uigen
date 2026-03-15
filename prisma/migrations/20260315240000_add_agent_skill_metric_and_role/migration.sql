-- CreateTable: AgentSkillMetric
CREATE TABLE "AgentSkillMetric" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSkillMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AgentRole
CREATE TABLE "AgentRole" (
    "id" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'REVIEWER',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentSkillMetric_agentName_category_key" ON "AgentSkillMetric"("agentName", "category");
CREATE INDEX "AgentSkillMetric_agentName_idx" ON "AgentSkillMetric"("agentName");
CREATE INDEX "AgentSkillMetric_category_score_idx" ON "AgentSkillMetric"("category", "score");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRole_agentName_key" ON "AgentRole"("agentName");
CREATE INDEX "AgentRole_role_idx" ON "AgentRole"("role");
