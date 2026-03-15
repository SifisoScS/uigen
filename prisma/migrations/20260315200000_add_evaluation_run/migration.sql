-- CreateTable
CREATE TABLE "EvaluationRun" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metrics" JSONB NOT NULL,
    "regressionDetected" BOOLEAN NOT NULL DEFAULT false,
    "baselineArtifactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationRun_artifactId_idx" ON "EvaluationRun"("artifactId");

-- CreateIndex
CREATE INDEX "EvaluationRun_status_idx" ON "EvaluationRun"("status");

-- CreateIndex
CREATE INDEX "EvaluationRun_artifactId_createdAt_idx" ON "EvaluationRun"("artifactId", "createdAt");
