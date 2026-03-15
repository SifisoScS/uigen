import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalRepo: { findUnique: vi.fn(), update: vi.fn() },
    artifactRelation: { findMany: vi.fn() },
    publicArtifact: { findUnique: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { syncExternalLineage } = await import("../sync-external-lineage");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { userId: "u1", email: "t@t.com", expiresAt: new Date(Date.now() + 3_600_000) };
const REPO = {
  id: "repo-1",
  name: "Remote UIGen",
  url: "https://remote.example.com",
  apiKey: null,
};
const RELATIONS = [
  { id: "rel-1", childId: "art-1", externalArtifactUrl: "https://remote.example.com/api/registry/r1" },
  { id: "rel-2", childId: "art-2", externalArtifactUrl: "https://remote.example.com/api/registry/r2" },
];

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(REPO as never);
  vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue(RELATIONS as never);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue({ projectId: "proj-1" } as never);
  vi.mocked(prisma.externalRepo.update).mockResolvedValue({} as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
  mockFetch.mockResolvedValue({ ok: true } as Response);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("syncExternalLineage", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(syncExternalLineage("repo-1")).rejects.toThrow(/unauthorized/i);
  });

  it("throws when ExternalRepo not found", async () => {
    vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(null);
    await expect(syncExternalLineage("repo-1")).rejects.toThrow(/externalrepo not found/i);
  });

  it("returns correct linksInspected count", async () => {
    const result = await syncExternalLineage("repo-1");
    expect(result.linksInspected).toBe(2);
  });

  it("counts reachable links when fetch returns ok", async () => {
    const result = await syncExternalLineage("repo-1");
    expect(result.linksReachable).toBe(2);
    expect(result.linksUnreachable).toBe(0);
  });

  it("counts unreachable links when fetch returns 404", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 } as Response);
    const result = await syncExternalLineage("repo-1");
    expect(result.linksUnreachable).toBe(2);
    expect(result.linksReachable).toBe(0);
  });

  it("counts unreachable on network error", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await syncExternalLineage("repo-1");
    expect(result.linksUnreachable).toBe(2);
  });

  it("updates ExternalRepo.lastSyncAt", async () => {
    await syncExternalLineage("repo-1");
    expect(prisma.externalRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "repo-1" },
        data: expect.objectContaining({ lastSyncAt: expect.any(Date) }),
      })
    );
  });

  it("logs EXTERNAL_LINEAGE_SYNCED governance event", async () => {
    await syncExternalLineage("repo-1");
    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "EXTERNAL_LINEAGE_SYNCED",
          details: expect.objectContaining({
            repoId: "repo-1",
            linksInspected: 2,
          }),
        }),
      })
    );
  });

  it("returns 0 links when no relations exist", async () => {
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);
    const result = await syncExternalLineage("repo-1");
    expect(result.linksInspected).toBe(0);
    expect(result.linksReachable).toBe(0);
  });
});
