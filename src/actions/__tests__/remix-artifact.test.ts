import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    project: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { remixArtifact } = await import("../remix-artifact");

// ── Helpers ───────────────────────────────────────────────────────────────────

const ARTIFACT = {
  id: "art-1",
  name: "My Button",
  filesData: '{"type":"directory","name":"/","path":"/","children":{}}',
};

const PROJECT = {
  id: "proj-new",
  name: "My Button (remix)",
  userId: null,
  messages: "[]",
  data: ARTIFACT.filesData,
  public: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(null);
  vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(
    ARTIFACT as never
  );
  // $transaction returns [project, updatedArtifact]
  vi.mocked(prisma.$transaction).mockResolvedValue([PROJECT, {}] as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("remixArtifact", () => {
  it("throws when artifact does not exist", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);

    await expect(remixArtifact("nonexistent")).rejects.toThrow(
      /artifact not found/i
    );
  });

  it("creates a new project and increments remixCount in a transaction", async () => {
    const result = await remixArtifact("art-1");

    expect(result.projectId).toBe("proj-new");
    // Verify the transaction was used (atomicity) with an array of two ops
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(prisma.$transaction).mock.calls[0][0] as unknown as unknown[];
    expect(Array.isArray(callArgs)).toBe(true);
    expect(callArgs).toHaveLength(2);
  });

  it("works for anonymous users (no session)", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const result = await remixArtifact("art-1");
    expect(result.projectId).toBe("proj-new");
  });

  it("works for authenticated users (with session)", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "user-abc",
      email: "test@example.com",
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    const result = await remixArtifact("art-1");
    expect(result.projectId).toBe("proj-new");
  });
});
