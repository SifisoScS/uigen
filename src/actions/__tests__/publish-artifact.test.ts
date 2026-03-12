import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    branchPolicy: {
      findUnique: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    publicArtifact: {
      create: vi.fn(),
      update: vi.fn(),
    },
    governanceEvent: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/governance/enforce", () => ({
  enforceBranchPolicy: vi.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { enforceBranchPolicy } = await import("@/lib/governance/enforce");
const { publishArtifact } = await import("../publish-artifact");

// ── Helpers ───────────────────────────────────────────────────────────────────

const SESSION = {
  userId: "user-abc",
  email: "test@example.com",
  expiresAt: new Date(Date.now() + 3_600_000),
};

const HUMAN_ONLY_POLICY = {
  id: "pol-1",
  projectId: "proj-1",
  branchName: "release/v1.0",
  policyType: "HUMAN_ONLY",
  rules: null,
  createdBy: "user-abc",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PROJECT = {
  id: "proj-1",
  userId: "user-abc",
  data: JSON.stringify({
    type: "directory",
    name: "/",
    path: "/",
    children: {
      "App.tsx": {
        type: "file",
        name: "App.tsx",
        path: "/App.tsx",
        content: "export default function App() { return <div>Hello</div>; }",
      },
    },
  }),
};

const ARTIFACT = {
  id: "art-1",
  projectId: "proj-1",
  branchName: "release/v1.0",
  version: "1.0.0",
  name: "My Component",
  description: null,
  manifest: {},
  filesData: PROJECT.data,
  previewImage: null,
  authorId: "user-abc",
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(prisma.branchPolicy.findUnique).mockResolvedValue(HUMAN_ONLY_POLICY as never);
  vi.mocked(prisma.project.findUnique).mockResolvedValue(PROJECT as never);
  vi.mocked(prisma.publicArtifact.create).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.publicArtifact.update).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("publishArtifact", () => {
  it("throws Unauthorized when not logged in", async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    await expect(
      publishArtifact({ projectId: "proj-1", branchName: "release/v1.0", name: "Test" })
    ).rejects.toThrow(/unauthorized/i);
  });

  it("throws when branch does not start with release/", async () => {
    vi.mocked(enforceBranchPolicy).mockResolvedValue(undefined);

    await expect(
      publishArtifact({ projectId: "proj-1", branchName: "feature/my-feature", name: "Test" })
    ).rejects.toThrow(/release/);
  });

  it("throws when policy is not HUMAN_ONLY", async () => {
    vi.mocked(prisma.branchPolicy.findUnique).mockResolvedValue({
      ...HUMAN_ONLY_POLICY,
      policyType: "OPEN",
    } as never);

    await expect(
      publishArtifact({ projectId: "proj-1", branchName: "release/v2.0", name: "Test" })
    ).rejects.toThrow(/HUMAN_ONLY/);
  });

  it("creates PublicArtifact and GovernanceEvent on valid release branch", async () => {
    const result = await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "My Component",
      description: "A nice button",
      version: "1.0.0",
      tags: ["button", "ui"],
    });

    expect(result.artifactId).toBe("art-1");
    expect(prisma.publicArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: "proj-1",
          branchName: "release/v1.0",
          name: "My Component",
          version: "1.0.0",
        }),
      })
    );
    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_PUBLISHED",
          projectId: "proj-1",
        }),
      })
    );
  });

  it("enforces governance policy before publishing", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "Test",
    });

    expect(enforceBranchPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj-1",
        branchName: "release/v1.0",
        actorType: "HUMAN",
        actionType: "PUBLISH",
      })
    );
  });

  it("propagates governance enforcement errors", async () => {
    vi.mocked(enforceBranchPolicy).mockRejectedValue(
      new Error("Policy violation: LOCKED blocks HUMAN actions")
    );

    await expect(
      publishArtifact({ projectId: "proj-1", branchName: "release/v1.0", name: "Test" })
    ).rejects.toThrow(/LOCKED/);
  });
});
