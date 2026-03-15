import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    artifactRelation: { findFirst: vi.fn() },
    project: { findUnique: vi.fn(), update: vi.fn() },
    publicArtifact: { findUnique: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { resolveVariantConflict } = await import("../resolve-variant-conflict");

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
  createdAt: new Date("2026-01-01"),
};

const ORIGINAL_DATA = JSON.stringify({
  type: "directory", name: "/", path: "/",
  children: {
    "App.tsx": { type: "file", name: "App.tsx", path: "/App.tsx", content: "original content" },
  },
});

const VARIANT_DATA = JSON.stringify({
  type: "directory", name: "/", path: "/",
  children: {
    "App.tsx": { type: "file", name: "App.tsx", path: "/App.tsx", content: "variant content" },
    "New.tsx": { type: "file", name: "New.tsx", path: "/New.tsx", content: "brand new file" },
  },
});

const VARIANT_PROJECT = {
  id: "proj-var-1",
  status: "APPROVED",
  data: VARIANT_DATA,
};

const ORIGINAL_PROJECT = {
  id: "orig-proj-1",
  data: ORIGINAL_DATA,
};

const ARTIFACT = {
  id: "art-1",
  projectId: "orig-proj-1",
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
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.project.update).mockResolvedValue({ id: "orig-proj-1" } as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveVariantConflict", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      resolveVariantConflict({
        originalArtifactId: "art-1",
        variantProjectId: "proj-var-1",
        resolutions: [],
      })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when variant is not linked to the artifact", async () => {
    vi.mocked(prisma.artifactRelation.findFirst).mockResolvedValue(null);

    await expect(
      resolveVariantConflict({
        originalArtifactId: "art-1",
        variantProjectId: "proj-var-1",
        resolutions: [],
      })
    ).rejects.toThrow(/not linked/i);
  });

  it("throws when variant project is not APPROVED", async () => {
    vi.mocked(prisma.project.findUnique).mockImplementation(((args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;
      if (id === "proj-var-1") {
        return Promise.resolve({ id: "proj-var-1", status: "DRAFT", data: VARIANT_DATA });
      }
      return Promise.resolve(ORIGINAL_PROJECT);
    }) as never);

    await expect(
      resolveVariantConflict({
        originalArtifactId: "art-1",
        variantProjectId: "proj-var-1",
        resolutions: [],
      })
    ).rejects.toThrow(/approved/i);
  });

  it("throws when artifact is not found", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);

    await expect(
      resolveVariantConflict({
        originalArtifactId: "art-1",
        variantProjectId: "proj-var-1",
        resolutions: [],
      })
    ).rejects.toThrow(/artifact not found/i);
  });

  it("updates original project data with merged FS and stamps mergedAt/conflictResolvedAt", async () => {
    await resolveVariantConflict({
      originalArtifactId: "art-1",
      variantProjectId: "proj-var-1",
      resolutions: [{ path: "/App.tsx", choice: "variant" }],
    });

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "orig-proj-1" },
        data: expect.objectContaining({
          mergedFromVariantId: "proj-var-1",
          mergedAt: expect.any(Date),
          conflictResolvedAt: expect.any(Date),
          data: expect.any(String),
        }),
      })
    );
  });

  it("applies 'keep original' resolution correctly", async () => {
    await resolveVariantConflict({
      originalArtifactId: "art-1",
      variantProjectId: "proj-var-1",
      resolutions: [{ path: "/App.tsx", choice: "original" }],
    });

    const updateCall = vi.mocked(prisma.project.update).mock.calls[0][0];
    const mergedData = JSON.parse((updateCall as { data: { data: string } }).data.data);

    // Walk the nested tree to find App.tsx
    const appFile = mergedData?.children?.["App.tsx"];
    expect(appFile?.content).toBe("original content");
  });

  it("applies 'take variant' resolution correctly", async () => {
    await resolveVariantConflict({
      originalArtifactId: "art-1",
      variantProjectId: "proj-var-1",
      resolutions: [{ path: "/App.tsx", choice: "variant" }],
    });

    const updateCall = vi.mocked(prisma.project.update).mock.calls[0][0];
    const mergedData = JSON.parse((updateCall as { data: { data: string } }).data.data);
    const appFile = mergedData?.children?.["App.tsx"];
    expect(appFile?.content).toBe("variant content");
  });

  it("logs ARTIFACT_VARIANT_CONFLICT_RESOLVED governance event", async () => {
    await resolveVariantConflict({
      originalArtifactId: "art-1",
      variantProjectId: "proj-var-1",
      resolutions: [{ path: "/App.tsx", choice: "variant" }],
    });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_VARIANT_CONFLICT_RESOLVED",
          projectId: "orig-proj-1",
          actor: "user-abc",
          details: expect.objectContaining({
            variantProjectId: "proj-var-1",
            originalArtifactId: "art-1",
            resolutionCount: 1,
          }),
        }),
      })
    );
  });

  it("applies resolvedContent directly when present (overrides choice)", async () => {
    await resolveVariantConflict({
      originalArtifactId: "art-1",
      variantProjectId: "proj-var-1",
      resolutions: [{ path: "/App.tsx", resolvedContent: "manually edited content" }],
    });

    const updateCall = vi.mocked(prisma.project.update).mock.calls[0][0];
    const mergedData = JSON.parse((updateCall as { data: { data: string } }).data.data);
    const appFile = mergedData?.children?.["App.tsx"];
    expect(appFile?.content).toBe("manually edited content");
  });

  it("includes conflictedFilesCount and resolvedFilesCount in governance event details", async () => {
    await resolveVariantConflict({
      originalArtifactId: "art-1",
      variantProjectId: "proj-var-1",
      resolutions: [{ path: "/App.tsx", choice: "variant" }],
    });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({
            conflictedFilesCount: 1,
            resolvedFilesCount: 1,
          }),
        }),
      })
    );
  });

  it("marks hasManualEdit=true in governance event when resolvedContent is provided", async () => {
    await resolveVariantConflict({
      originalArtifactId: "art-1",
      variantProjectId: "proj-var-1",
      resolutions: [{ path: "/App.tsx", resolvedContent: "custom edit" }],
    });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({
            resolutions: expect.arrayContaining([
              expect.objectContaining({ path: "/App.tsx", hasManualEdit: true }),
            ]),
          }),
        }),
      })
    );
  });

  it("returns { mergedAt, conflictResolvedAt } as Dates", async () => {
    const result = await resolveVariantConflict({
      originalArtifactId: "art-1",
      variantProjectId: "proj-var-1",
      resolutions: [],
    });

    expect(result.mergedAt).toBeInstanceOf(Date);
    expect(result.conflictResolvedAt).toBeInstanceOf(Date);
  });
});
