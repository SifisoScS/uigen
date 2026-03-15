import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    artifactRelation: { findFirst: vi.fn(), upsert: vi.fn() },
    project: { findUnique: vi.fn() },
    publicArtifact: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    evaluationRun: { findFirst: vi.fn() },
    governanceEvent: { create: vi.fn() },
    semanticTransform: { create: vi.fn() },
  },
}));

vi.mock("@/lib/artifact-introspection", () => ({
  computeFilesHash: vi.fn(() => "hash-abc"),
  computePolicyHash: vi.fn(() => "policy-hash"),
  generateSemanticSummary: vi.fn(() => "MyComponent component"),
  parseComponentTree: vi.fn(() => ({ type: "component", _stub: true })),
  extractStyleSignature: vi.fn(() => ({ classes: [], colors: [], spacing: [], usedComponents: [], propSummary: {} })),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { publishVariantAsArtifact } = await import("../publish-variant-as-artifact");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = {
  userId: "user-abc",
  email: "test@example.com",
  expiresAt: new Date(Date.now() + 3_600_000),
};

const RELATION = {
  id: "rel-1",
  parentType: "PublicArtifact",
  parentId: "art-1",
  childType: "Project",
  childId: "proj-var-1",
  relationType: "NEW_VARIANT_OF",
  createdAt: new Date(),
};

const VARIANT_PROJECT = {
  id: "proj-var-1",
  name: "MyComponent \u2014 Add aria-labels",
  data: JSON.stringify({ "/App.jsx": { type: "file", name: "App.jsx", path: "/App.jsx", content: "mutated code" } }),
};

const ORIGINAL_PROJECT = {
  id: "orig-proj-1",
  data: JSON.stringify({ "/App.jsx": { type: "file", name: "App.jsx", path: "/App.jsx", content: "original code" } }),
  mergedFromVariantId: "proj-var-1",
  conflictResolvedAt: null,
  userId: "user-abc",
};

const ORIGINAL_ARTIFACT = {
  id: "art-1",
  name: "MyComponent",
  version: "1.0.0",
  projectId: "orig-proj-1",
  description: null,
  manifest: { registryTags: ["ui", "form"] },
  filesData: JSON.stringify({ "/App.jsx": { type: "file", name: "App.jsx", path: "/App.jsx", content: "<Button />" } }),
};

const NEW_ARTIFACT = {
  id: "art-2",
  name: "MyComponent",
  version: "1.1.0",
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.artifactRelation.findFirst).mockResolvedValue(RELATION as never);
  vi.mocked(prisma.project.findUnique).mockImplementation(((args: unknown) => {
    const id = (args as { where: { id: string } }).where.id;
    if (id === "proj-var-1") return Promise.resolve(VARIANT_PROJECT);
    if (id === "orig-proj-1") return Promise.resolve(ORIGINAL_PROJECT);
    return Promise.resolve(null);
  }) as never);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ORIGINAL_ARTIFACT as never);
  vi.mocked(prisma.publicArtifact.create).mockResolvedValue(NEW_ARTIFACT as never);
  vi.mocked(prisma.publicArtifact.update).mockResolvedValue(NEW_ARTIFACT as never);
  vi.mocked(prisma.evaluationRun.findFirst).mockResolvedValue(null); // no evaluation = allowed
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
  vi.mocked(prisma.artifactRelation.upsert).mockResolvedValue({ id: "rel-2" } as never);
  vi.mocked(prisma.semanticTransform.create).mockResolvedValue({ id: "st-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("publishVariantAsArtifact", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      publishVariantAsArtifact({ variantProjectId: "proj-var-1", originalArtifactId: "art-1" })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when variant is not linked to the artifact", async () => {
    vi.mocked(prisma.artifactRelation.findFirst).mockResolvedValue(null);

    await expect(
      publishVariantAsArtifact({ variantProjectId: "proj-var-1", originalArtifactId: "art-1" })
    ).rejects.toThrow(/not linked/i);
  });

  it("throws when variant must be merged first", async () => {
    vi.mocked(prisma.project.findUnique).mockImplementation(((args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;
      if (id === "proj-var-1") return Promise.resolve(VARIANT_PROJECT);
      if (id === "orig-proj-1") {
        return Promise.resolve({ ...ORIGINAL_PROJECT, mergedFromVariantId: null });
      }
      return Promise.resolve(null);
    }) as never);

    await expect(
      publishVariantAsArtifact({ variantProjectId: "proj-var-1", originalArtifactId: "art-1" })
    ).rejects.toThrow(/must be merged/i);
  });

  it("creates PublicArtifact with incremented minor version", async () => {
    const result = await publishVariantAsArtifact({
      variantProjectId: "proj-var-1",
      originalArtifactId: "art-1",
    });

    expect(prisma.publicArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ version: "1.1.0" }),
      })
    );
    expect(result.version).toBe("1.1.0");
    expect(result.artifactId).toBe("art-2");
  });

  it("sets parentArtifactId to originalArtifactId on the new artifact", async () => {
    await publishVariantAsArtifact({
      variantProjectId: "proj-var-1",
      originalArtifactId: "art-1",
    });

    expect(prisma.publicArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentArtifactId: "art-1" }),
      })
    );
  });

  it("logs ARTIFACT_VARIANT_PUBLISHED governance event with correct fields", async () => {
    await publishVariantAsArtifact({
      variantProjectId: "proj-var-1",
      originalArtifactId: "art-1",
    });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_VARIANT_PUBLISHED",
          projectId: "orig-proj-1",
          actor: "user-abc",
          details: expect.objectContaining({
            variantProjectId: "proj-var-1",
            parentArtifactId: "art-1",
            version: "1.1.0",
          }),
        }),
      })
    );
  });

  it("uses variantProject.data when conflictResolvedAt is null (clean merge path)", async () => {
    // conflictResolvedAt is null in the default ORIGINAL_PROJECT fixture
    await publishVariantAsArtifact({
      variantProjectId: "proj-var-1",
      originalArtifactId: "art-1",
    });

    expect(prisma.publicArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ filesData: VARIANT_PROJECT.data }),
      })
    );
  });

  it("uses originalProject.data when conflictResolvedAt is set (conflict-resolved path)", async () => {
    const mergedData = JSON.stringify({ "/App.jsx": { type: "file", name: "App.jsx", path: "/App.jsx", content: "merged code" } });

    vi.mocked(prisma.project.findUnique).mockImplementation(((args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;
      if (id === "proj-var-1") return Promise.resolve(VARIANT_PROJECT);
      if (id === "orig-proj-1") {
        return Promise.resolve({
          ...ORIGINAL_PROJECT,
          conflictResolvedAt: new Date(),
          data: mergedData,
        });
      }
      return Promise.resolve(null);
    }) as never);

    await publishVariantAsArtifact({
      variantProjectId: "proj-var-1",
      originalArtifactId: "art-1",
    });

    expect(prisma.publicArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ filesData: mergedData }),
      })
    );
  });

  it("throws when the latest evaluation run for the artifact is FAILED", async () => {
    vi.mocked(prisma.evaluationRun.findFirst).mockResolvedValue({
      status: "FAILED",
    } as never);

    await expect(
      publishVariantAsArtifact({ variantProjectId: "proj-var-1", originalArtifactId: "art-1" })
    ).rejects.toThrow(/failed evaluation/i);
  });

  it("allows publish when no evaluation run exists (backwards compat)", async () => {
    vi.mocked(prisma.evaluationRun.findFirst).mockResolvedValue(null);

    const result = await publishVariantAsArtifact({
      variantProjectId: "proj-var-1",
      originalArtifactId: "art-1",
    });
    expect(result.artifactId).toBe("art-2");
  });

  it("upserts ArtifactRelation with VARIANT_PROMOTED_TO type", async () => {
    await publishVariantAsArtifact({
      variantProjectId: "proj-var-1",
      originalArtifactId: "art-1",
    });

    expect(prisma.artifactRelation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          parentType: "PublicArtifact",
          parentId: "art-1",
          childType: "PublicArtifact",
          childId: "art-2",
          relationType: "VARIANT_PROMOTED_TO",
        }),
      })
    );
  });

  it("creates a SemanticTransform record linking fromArtifactId to toArtifactId", async () => {
    await publishVariantAsArtifact({
      variantProjectId: "proj-var-1",
      originalArtifactId: "art-1",
    });

    expect(prisma.semanticTransform.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromArtifactId: "art-1",
          toArtifactId: "art-2",
          addedComponents: expect.any(Array),
          removedComponents: expect.any(Array),
          a11yDelta: expect.any(Number),
          linesChanged: expect.any(Number),
        }),
      })
    );
  });

  it("logs SEMANTIC_TRANSFORM_RECORDED governance event", async () => {
    await publishVariantAsArtifact({
      variantProjectId: "proj-var-1",
      originalArtifactId: "art-1",
    });

    const calls = vi.mocked(prisma.governanceEvent.create).mock.calls;
    const semanticCall = calls.find(
      (c) => (c[0] as { data: { type: string } }).data.type === "SEMANTIC_TRANSFORM_RECORDED"
    );
    expect(semanticCall).toBeDefined();
    expect((semanticCall![0] as unknown as { data: { details: { fromArtifactId: string } } }).data.details.fromArtifactId).toBe("art-1");
  });
});
