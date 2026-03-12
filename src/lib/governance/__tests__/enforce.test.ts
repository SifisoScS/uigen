import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    branchPolicy: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    governanceEvent: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { enforceBranchPolicy, registerBranchPolicy } from "../enforce";

const mockFindUnique = vi.mocked(prisma.branchPolicy.findUnique);
const mockCreate = vi.mocked(prisma.branchPolicy.create);
const mockEventCreate = vi.mocked(prisma.governanceEvent.create);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: create returns the policyType passed in data
  mockCreate.mockImplementation(
    (args) =>
      Promise.resolve({ policyType: (args as { data: { policyType: string } }).data.policyType }) as ReturnType<typeof mockCreate>
  );
  mockEventCreate.mockResolvedValue({ id: "evt-1" } as never);
});

describe("enforceBranchPolicy", () => {
  it("blocks HUMAN actor from mutating AI_ONLY branch", async () => {
    mockFindUnique.mockResolvedValue({ policyType: "AI_ONLY" } as never);

    await expect(
      enforceBranchPolicy({
        projectId: "p1",
        branchName: "protected/main",
        actorType: "HUMAN",
        actionType: "WRITE",
      })
    ).rejects.toThrow("AI_ONLY");
  });

  it("blocks any direct mutation to release/* branch", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      enforceBranchPolicy({
        projectId: "p1",
        branchName: "release/1.0",
        actorType: "HUMAN",
        actionType: "WRITE",
      })
    ).rejects.toThrow("release");
  });

  it("blocks AI actor from mutating release/* branch directly", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      enforceBranchPolicy({
        projectId: "p1",
        branchName: "release/2.0",
        actorType: "AI",
        actionType: "RESTORE",
      })
    ).rejects.toThrow("release");
  });

  it("allows AI actor on AI_ONLY branch", async () => {
    mockFindUnique.mockResolvedValue({ policyType: "AI_ONLY" } as never);

    await expect(
      enforceBranchPolicy({
        projectId: "p1",
        branchName: "protected/main",
        actorType: "AI",
        actionType: "WRITE",
      })
    ).resolves.toBeUndefined();
  });

  it("allows HUMAN actor on OPEN branch", async () => {
    mockFindUnique.mockResolvedValue({ policyType: "OPEN" } as never);

    await expect(
      enforceBranchPolicy({
        projectId: "p1",
        branchName: "feature/dark-mode",
        actorType: "HUMAN",
        actionType: "WRITE",
      })
    ).resolves.toBeUndefined();
  });

  it("auto-creates OPEN policy for feature/* on first mutation and allows it", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      enforceBranchPolicy({
        projectId: "p1",
        branchName: "feature/nav",
        actorType: "HUMAN",
        actionType: "WRITE",
      })
    ).resolves.toBeUndefined();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ policyType: "OPEN" }),
      })
    );
    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "BRANCH_POLICY_SET" }),
      })
    );
  });

  it("auto-creates AI_ONLY policy for protected/* on first mutation", async () => {
    mockFindUnique.mockResolvedValue(null);

    // AI can write to protected/* — allowed
    await expect(
      enforceBranchPolicy({
        projectId: "p1",
        branchName: "protected/staging",
        actorType: "AI",
        actionType: "WRITE",
      })
    ).resolves.toBeUndefined();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ policyType: "AI_ONLY" }),
      })
    );
  });

  it("allows MERGE action on release/* branch for HUMAN", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      enforceBranchPolicy({
        projectId: "p1",
        branchName: "release/1.0",
        actorType: "HUMAN",
        actionType: "MERGE",
      })
    ).resolves.toBeUndefined();
  });

  it("throws for LOCKED branch regardless of actor", async () => {
    mockFindUnique.mockResolvedValue({ policyType: "LOCKED" } as never);

    await expect(
      enforceBranchPolicy({
        projectId: "p1",
        branchName: "feature/old",
        actorType: "HUMAN",
        actionType: "WRITE",
      })
    ).rejects.toThrow("LOCKED");

    mockFindUnique.mockResolvedValue({ policyType: "LOCKED" } as never);

    await expect(
      enforceBranchPolicy({
        projectId: "p1",
        branchName: "feature/old",
        actorType: "AI",
        actionType: "WRITE",
      })
    ).rejects.toThrow("LOCKED");
  });
});

describe("registerBranchPolicy", () => {
  it("creates policy record on first call and logs event", async () => {
    vi.mocked(prisma.branchPolicy.findUnique).mockResolvedValue(null);

    await registerBranchPolicy("p1", "protected/main", "HUMAN");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ policyType: "AI_ONLY", branchName: "protected/main" }),
      })
    );
    expect(mockEventCreate).toHaveBeenCalledOnce();
  });

  it("skips creation if policy already exists", async () => {
    vi.mocked(prisma.branchPolicy.findUnique).mockResolvedValue({ id: "existing" } as never);

    await registerBranchPolicy("p1", "feature/nav", "HUMAN");

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockEventCreate).not.toHaveBeenCalled();
  });
});
