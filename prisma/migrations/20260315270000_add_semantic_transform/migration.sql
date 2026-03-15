-- CreateTable: SemanticTransform
CREATE TABLE "SemanticTransform" (
    "id"                TEXT        NOT NULL,
    "fromArtifactId"    TEXT        NOT NULL,
    "toArtifactId"      TEXT        NOT NULL,
    "addedComponents"   TEXT[]      NOT NULL DEFAULT '{}',
    "removedComponents" TEXT[]      NOT NULL DEFAULT '{}',
    "modifiedProps"     JSONB       NOT NULL DEFAULT '{}',
    "a11yDelta"         INTEGER     NOT NULL DEFAULT 0,
    "linesChanged"      INTEGER     NOT NULL DEFAULT 0,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SemanticTransform_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex (one transform per new artifact)
CREATE UNIQUE INDEX "SemanticTransform_toArtifactId_key" ON "SemanticTransform"("toArtifactId");

-- CreateIndex
CREATE INDEX "SemanticTransform_fromArtifactId_idx" ON "SemanticTransform"("fromArtifactId");
