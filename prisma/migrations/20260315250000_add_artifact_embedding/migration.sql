-- CreateTable: ArtifactEmbedding
CREATE TABLE "ArtifactEmbedding" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "vector" DOUBLE PRECISION[] NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'stub-v1',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtifactEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactEmbedding_artifactId_key" ON "ArtifactEmbedding"("artifactId");
CREATE INDEX "ArtifactEmbedding_artifactId_idx" ON "ArtifactEmbedding"("artifactId");
