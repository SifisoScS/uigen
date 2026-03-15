import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: { findUnique: vi.fn() },
    externalRepo: { findUnique: vi.fn() },
    artifactRelation: { findFirst: vi.fn(), create: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { linkExternalArtifact } = await import("../link-external-artifact");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { userId: "u1", email: "t@t.com", expiresAt: new Date(Date.now() + 3_600_000) };
const ARTIFACT = { id: "art-1", projectId: "proj-1" };
const REPO = { id: "repo-1", name: "Remote UIGen", url: "https://remote.example.com" };
const RELATION = { id: "rel-1" };

const INPUT = {
  localArtifactId: "art-1",
  externalRepoId: "repo-1",
  externalArtifactUrl: "https://remote.example.com/api/registry/remote-art-1",
  relationType: "FORKED_FROM_EXTERNAL",
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(REPO as never);
  vi.mocked(prisma.artifactRelation.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.artifactRelation.create).mockResolvedValue(RELATION as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("linkExternalArtifact", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(linkExternalArtifact(INPUT)).rejects.toThrow(/unauthorized/i);
  });

  it("throws when local artifact not found", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);
    await expect(linkExternalArtifact(INPUT)).rejects.toThrow(/artifact not found/i);
  });

  it("throws when ExternalRepo not found", async () => {
    vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(null);
    await expect(linkExternalArtifact(INPUT)).rejects.toThrow(/externalrepo not found/i);
  });

  it("creates relation with externalRepoId and externalArtifactUrl set", async () => {
    await linkExternalArtifact(INPUT);
    expect(prisma.artifactRelation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentType: "ExternalArtifact",
          externalRepoId: "repo-1",
          externalArtifactUrl: INPUT.externalArtifactUrl,
          relationType: "FORKED_FROM_EXTERNAL",
        }),
      })
    );
  });

  it("returns alreadyLinked=false on first link", async () => {
    const result = await linkExternalArtifact(INPUT);
    expect(result.alreadyLinked).toBe(false);
    expect(result.relationId).toBe("rel-1");
  });

  it("returns alreadyLinked=true when relation already exists", async () => {
    vi.mocked(prisma.artifactRelation.findFirst).mockResolvedValue({ id: "rel-existing" } as never);
    const result = await linkExternalArtifact(INPUT);
    expect(result.alreadyLinked).toBe(true);
    expect(prisma.artifactRelation.create).not.toHaveBeenCalled();
  });

  it("logs EXTERNAL_ARTIFACT_LINKED governance event", async () => {
    await linkExternalArtifact(INPUT);
    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "EXTERNAL_ARTIFACT_LINKED",
          projectId: "proj-1",
          actor: "u1",
        }),
      })
    );
  });
});
