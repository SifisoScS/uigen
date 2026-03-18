import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalRepo: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { registerExternalRepo, listExternalRepos } = await import("../register-external-repo");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SESSION = { userId: "u1", email: "t@t.com", expiresAt: new Date(Date.now() + 3_600_000) };

const REPO = {
  id: "repo-1",
  name: "Remote UIGen",
  url: "https://remote.example.com",
  apiKey: null,
  lastSyncAt: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.externalRepo.create).mockResolvedValue(REPO as never);
  vi.mocked(prisma.externalRepo.findMany).mockResolvedValue([REPO] as never);
  // Default: handshake succeeds with a node DID
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      accepted: true,
      my_node_info: { node_did: "did:key:zabc123" },
    }),
  }));
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("registerExternalRepo", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(
      registerExternalRepo({ name: "X", url: "https://x.com" })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when url is not absolute HTTP", async () => {
    await expect(
      registerExternalRepo({ name: "X", url: "ftp://x.com" })
    ).rejects.toThrow(/url must be/i);
  });

  it("creates a new repo and returns alreadyExisted=false", async () => {
    const result = await registerExternalRepo({ name: "Remote UIGen", url: "https://remote.example.com" });
    expect(result.alreadyExisted).toBe(false);
    expect(result.id).toBe("repo-1");
    expect(prisma.externalRepo.create).toHaveBeenCalledOnce();
  });

  it("returns alreadyExisted=true when url already registered", async () => {
    vi.mocked(prisma.externalRepo.findUnique).mockResolvedValue(REPO as never);
    const result = await registerExternalRepo({ name: "Remote UIGen", url: "https://remote.example.com" });
    expect(result.alreadyExisted).toBe(true);
    expect(prisma.externalRepo.create).not.toHaveBeenCalled();
  });

  it("passes apiKey to create when provided", async () => {
    await registerExternalRepo({ name: "Secured", url: "https://secure.example.com", apiKey: "sk-abc" });
    expect(prisma.externalRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ apiKey: "sk-abc" }) })
    );
  });
});

// ── Mesh handshake integration (Phase 40 — §13.4) ─────────────────────────────

describe("registerExternalRepo — mesh handshake", () => {
  it("calls /mesh/handshake and stores node_did as nodeId when accepted", async () => {
    await registerExternalRepo({ name: "Remote UIGen", url: "https://remote.example.com" });

    expect(fetch).toHaveBeenCalledWith(
      "https://remote.example.com/mesh/handshake",
      expect.objectContaining({ method: "POST" })
    );
    expect(prisma.externalRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nodeId: "did:key:zabc123" }) })
    );
  });

  it("stores null nodeId when handshake fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    await registerExternalRepo({ name: "Remote UIGen", url: "https://remote.example.com" });

    expect(prisma.externalRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nodeId: null }) })
    );
  });

  it("stores null nodeId when handshake returns accepted: false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: false, reason: "Gate check failed" }),
    }));

    await registerExternalRepo({ name: "Remote UIGen", url: "https://remote.example.com" });

    expect(prisma.externalRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nodeId: null }) })
    );
  });

  it("repo is created successfully even when handshake returns non-2xx", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const result = await registerExternalRepo({ name: "Remote UIGen", url: "https://remote.example.com" });

    expect(result.id).toBe("repo-1");
    expect(prisma.externalRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ nodeId: null }) })
    );
  });
});

describe("listExternalRepos", () => {
  it("throws Unauthorized when no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    await expect(listExternalRepos()).rejects.toThrow(/unauthorized/i);
  });

  it("returns repos and selects without apiKey field", async () => {
    const result = await listExternalRepos();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("repo-1");
    // Verify the prisma select does not include apiKey
    const call = vi.mocked(prisma.externalRepo.findMany).mock.calls[0][0];
    expect(call?.select).not.toHaveProperty("apiKey");
  });
});
