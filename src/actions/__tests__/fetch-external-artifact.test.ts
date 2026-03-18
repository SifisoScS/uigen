import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalRepo: { findUnique: vi.fn() },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { fetchExternalArtifact } = await import("../fetch-external-artifact");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { userId: "user-abc", email: "test@example.com", expiresAt: new Date(Date.now() + 3_600_000) };

const REPO = {
  id: "repo-1",
  name: "KilimanjaroCode Registry",
  url: "https://remote.example.com",
  apiKey: null,
};

const REMOTE_ARTIFACT = {
  id: "remote-art-1",
  name: "RemoteButton",
  version: "2.0.0",
  description: "A button from a remote registry",
  semanticSummary: "Accessible button component",
  componentTree: { type: "JSXElement", name: "Button" },
  styleSignature: { classes: ["flex"], colors: [], spacing: [], usedComponents: ["Button"] },
  remixCount: 5,
  authorId: "remote-user",
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(REPO as never);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => REMOTE_ARTIFACT,
  }));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fetchExternalArtifact", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      fetchExternalArtifact("repo-1", "remote-art-1")
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when ExternalRepo is not found", async () => {
    vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(null);

    await expect(
      fetchExternalArtifact("nonexistent", "remote-art-1")
    ).rejects.toThrow(/ExternalRepo not found/);
  });

  it("calls the correct remote endpoint", async () => {
    await fetchExternalArtifact("repo-1", "remote-art-1");

    expect(fetch).toHaveBeenCalledWith(
      "https://remote.example.com/api/registry/remote-art-1",
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "application/json" }) })
    );
  });

  it("strips trailing slash from repo URL before building endpoint", async () => {
    vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue({
      ...REPO, url: "https://remote.example.com/",
    } as never);

    await fetchExternalArtifact("repo-1", "remote-art-1");

    expect(fetch).toHaveBeenCalledWith(
      "https://remote.example.com/api/registry/remote-art-1",
      expect.anything()
    );
  });

  it("includes Authorization header when apiKey is set", async () => {
    vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue({
      ...REPO, apiKey: "secret-key",
    } as never);

    await fetchExternalArtifact("repo-1", "remote-art-1");

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret-key" }),
      })
    );
  });

  it("returns repoId, repoName, artifact, and fetchedAt on success", async () => {
    const result = await fetchExternalArtifact("repo-1", "remote-art-1");

    expect(result.repoId).toBe("repo-1");
    expect(result.repoName).toBe("KilimanjaroCode Registry");
    expect(result.artifact.id).toBe("remote-art-1");
    expect(result.artifact.name).toBe("RemoteButton");
    expect(result.fetchedAt).toBeInstanceOf(Date);
  });

  it("throws when remote returns non-2xx status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    await expect(
      fetchExternalArtifact("repo-1", "remote-art-1")
    ).rejects.toThrow(/404/);
  });

  it("throws when remote returns invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError("Unexpected token"); },
    }));

    await expect(
      fetchExternalArtifact("repo-1", "remote-art-1")
    ).rejects.toThrow(/not valid JSON/);
  });

  it("throws when fetch itself rejects (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await expect(
      fetchExternalArtifact("repo-1", "remote-art-1")
    ).rejects.toThrow(/Network error/);
  });
});
