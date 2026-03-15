-- AlterTable: add status to WorkflowRun
ALTER TABLE "WorkflowRun" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';

-- CreateIndex on WorkflowRun status
CREATE INDEX "WorkflowRun_status_idx" ON "WorkflowRun"("status");

-- CreateTable: WorkflowStep
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "stepType" TEXT NOT NULL,
    "inputData" JSONB,
    "outputData" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WorkflowDefinition
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stepsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowStep_runId_idx" ON "WorkflowStep"("runId");

-- CreateIndex
CREATE INDEX "WorkflowStep_runId_stepIndex_idx" ON "WorkflowStep"("runId", "stepIndex");

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
