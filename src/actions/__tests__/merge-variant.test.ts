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
const { mergeVariant } = await import("../merge-variant");

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

// Variant project with empty data (no conflicts with original)
const VARIANT_PROJECT = {
  id: "proj-var-1",
  status: "APPROVED",
  data: "{}",
};

// Original project with some file content
const ORIGINAL_PROJECT = {
  id: "orig-proj-1",
  data: "{}",
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

describe("mergeVariant", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when variant is not linked to the artifact", async () => {
    vi.mocked(prisma.artifactRelation.findFirst).mockResolvedValue(null);

    await expect(
      mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/not linked/i);
  });

  it("throws when variant project is not found", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null);

    await expect(
      mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/not found/i);
  });

  it("throws when variant status is not APPROVED", async () => {
    vi.mocked(prisma.project.findUnique).mockImplementation(((args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;
      if (id === "proj-var-1") {
        return Promise.resolve({ id: "proj-var-1", status: "DRAFT", data: "{}" });
      }
      return Promise.resolve(ORIGINAL_PROJECT);
    }) as never);

    await expect(
      mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/approved/i);
  });

  it("throws when original artifact is not found", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);

    await expect(
      mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" })
    ).rejects.toThrow(/artifact not found/i);
  });

  it("returns { type: 'ok', mergedAt } when no conflicts", async () => {
    const result = await mergeVariant({
      originalArtifactId: "art-1",
      variantProjectId: "proj-var-1",
    });

    expect(result.type).toBe("ok");
    if (result.type === "ok") {
      expect(result.mergedAt).toBeInstanceOf(Date);
    }
  });

  it("updates original project with mergedFromVariantId and mergedAt on clean merge", async () => {
    await mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" });

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "orig-proj-1" },
        data: expect.objectContaining({
          mergedFromVariantId: "proj-var-1",
          mergedAt: expect.any(Date),
        }),
      })
    );
  });

  it("logs ARTIFACT_VARIANT_MERGED governance event on clean merge", async () => {
    await mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_VARIANT_MERGED",
          projectId: "orig-proj-1",
          actor: "user-abc",
          details: expect.objectContaining({
            variantProjectId: "proj-var-1",
            originalArtifactId: "art-1",
          }),
        }),
      })
    );
  });

  it("returns { type: 'conflict', conflictingFiles } when files differ", async () => {
    // Variant has App.tsx with different content than original
    const originalData = JSON.stringify({
      type: "directory", name: "/", path: "/",
      children: {
        "App.tsx": { type: "file", name: "App.tsx", path: "/App.tsx", content: "original content" },
      },
    });
    const variantData = JSON.stringify({
      type: "directory", name: "/", path: "/",
      children: {
        "App.tsx": { type: "file", name: "App.tsx", path: "/App.tsx", content: "variant content" },
      },
    });

    vi.mocked(prisma.project.findUnique).mockImplementation(((args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;
      if (id === "proj-var-1") {
        return Promise.resolve({ id: "proj-var-1", status: "APPROVED", data: variantData });
      }
      if (id === "orig-proj-1") {
        return Promise.resolve({ id: "orig-proj-1", data: originalData });
      }
      return Promise.resolve(null);
    }) as never);

    const result = await mergeVariant({
      originalArtifactId: "art-1",
      variantProjectId: "proj-var-1",
    });

    expect(result.type).toBe("conflict");
    if (result.type === "conflict") {
      expect(result.conflictingFiles).toHaveLength(1);
      expect(result.conflictingFiles[0].path).toBe("/App.tsx");
      expect(result.conflictingFiles[0].originalContent).toBe("original content");
      expect(result.conflictingFiles[0].variantContent).toBe("variant content");
    }
  });

  it("does NOT update project when conflicts are detected", async () => {
    const conflictData = JSON.stringify({
      type: "directory", name: "/", path: "/",
      children: {
        "App.tsx": { type: "file", name: "App.tsx", path: "/App.tsx", content: "different" },
      },
    });
    const originalData = JSON.stringify({
      type: "directory", name: "/", path: "/",
      children: {
        "App.tsx": { type: "file", name: "App.tsx", path: "/App.tsx", content: "original" },
      },
    });

    vi.mocked(prisma.project.findUnique).mockImplementation(((args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;
      if (id === "proj-var-1") {
        return Promise.resolve({ id: "proj-var-1", status: "APPROVED", data: conflictData });
      }
      return Promise.resolve({ id: "orig-proj-1", data: originalData });
    }) as never);

    await mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" });

    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it("logs ARTIFACT_VARIANT_CONFLICT_DETECTED governance event on conflict", async () => {
    const conflictData = JSON.stringify({
      type: "directory", name: "/", path: "/",
      children: {
        "App.tsx": { type: "file", name: "App.tsx", path: "/App.tsx", content: "different" },
      },
    });
    const originalData = JSON.stringify({
      type: "directory", name: "/", path: "/",
      children: {
        "App.tsx": { type: "file", name: "App.tsx", path: "/App.tsx", content: "original" },
      },
    });

    vi.mocked(prisma.project.findUnique).mockImplementation(((args: unknown) => {
      const id = (args as { where: { id: string } }).where.id;
      if (id === "proj-var-1") {
        return Promise.resolve({ id: "proj-var-1", status: "APPROVED", data: conflictData });
      }
      return Promise.resolve({ id: "orig-proj-1", data: originalData });
    }) as never);

    await mergeVariant({ originalArtifactId: "art-1", variantProjectId: "proj-var-1" });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_VARIANT_CONFLICT_DETECTED",
          projectId: "orig-proj-1",
          actor: "user-abc",
          details: expect.objectContaining({
            conflictCount: 1,
            conflictingPaths: ["/App.tsx"],
          }),
        }),
      })
    );
  });
});
