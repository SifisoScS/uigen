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
    workflowRun: {
      findUnique: vi.fn(),
    },
    datasetSnapshot: {
      findUnique: vi.fn(),
    },
    artifactRelation: {
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

const WORKFLOW_RUN = {
  id: "wf-run-1",
  name: "Generate AuthForm",
  description: null,
  outputSummary: "Generated AuthForm with dark mode",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DATASET_SNAPSHOT = {
  id: "ds-1",
  name: "AuthForm Training Data",
  description: null,
  format: "csv",
  rowCount: 500,
  columnSummary: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(SESSION);
  vi.mocked(enforceBranchPolicy).mockResolvedValue(undefined);
  vi.mocked(prisma.branchPolicy.findUnique).mockResolvedValue(HUMAN_ONLY_POLICY as never);
  vi.mocked(prisma.project.findUnique).mockResolvedValue(PROJECT as never);
  vi.mocked(prisma.publicArtifact.create).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.publicArtifact.update).mockResolvedValue(ARTIFACT as never);
  vi.mocked(prisma.governanceEvent.create).mockResolvedValue({ id: "evt-1" } as never);
  vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(WORKFLOW_RUN as never);
  vi.mocked(prisma.datasetSnapshot.findUnique).mockResolvedValue(DATASET_SNAPSHOT as never);
  vi.mocked(prisma.artifactRelation.create).mockResolvedValue({ id: "rel-1" } as never);
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

describe("publishArtifact — WorkflowRun linkage", () => {
  it("creates ArtifactRelation when workflowRunId is provided", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "My Component",
      workflowRunId: "wf-run-1",
    });

    expect(prisma.artifactRelation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentType: "WorkflowRun",
          parentId: "wf-run-1",
          childType: "PublicArtifact",
          childId: "art-1",
          relationType: "GENERATED_BY",
        }),
      })
    );
  });

  it("logs ARTIFACT_RELATION_CREATED governance event when workflowRunId is provided", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "My Component",
      workflowRunId: "wf-run-1",
    });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_RELATION_CREATED",
          details: expect.objectContaining({
            parentType: "WorkflowRun",
            parentId: "wf-run-1",
            relationType: "GENERATED_BY",
          }),
        }),
      })
    );
  });

  it("throws when workflowRunId does not exist", async () => {
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(null);

    await expect(
      publishArtifact({
        projectId: "proj-1",
        branchName: "release/v1.0",
        name: "My Component",
        workflowRunId: "nonexistent-run",
      })
    ).rejects.toThrow(/WorkflowRun not found/);
  });

  it("does NOT create ArtifactRelation when workflowRunId is omitted", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "My Component",
    });

    expect(prisma.artifactRelation.create).not.toHaveBeenCalled();
  });
});

describe("publishArtifact — DatasetSnapshot linkage", () => {
  it("creates INFORMED_BY ArtifactRelation when datasetSnapshotId is provided", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "My Component",
      datasetSnapshotId: "ds-1",
    });

    expect(prisma.artifactRelation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentType: "DatasetSnapshot",
          parentId: "ds-1",
          childType: "PublicArtifact",
          childId: "art-1",
          relationType: "INFORMED_BY",
        }),
      })
    );
  });

  it("logs ARTIFACT_RELATION_CREATED governance event for DatasetSnapshot linkage", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "My Component",
      datasetSnapshotId: "ds-1",
    });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_RELATION_CREATED",
          details: expect.objectContaining({
            parentType: "DatasetSnapshot",
            parentId: "ds-1",
            relationType: "INFORMED_BY",
          }),
        }),
      })
    );
  });

  it("throws when datasetSnapshotId does not exist", async () => {
    vi.mocked(prisma.datasetSnapshot.findUnique).mockResolvedValue(null);

    await expect(
      publishArtifact({
        projectId: "proj-1",
        branchName: "release/v1.0",
        name: "My Component",
        datasetSnapshotId: "nonexistent-ds",
      })
    ).rejects.toThrow(/DatasetSnapshot not found/);
  });

  it("does NOT create DatasetSnapshot relation when datasetSnapshotId is omitted", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "My Component",
    });

    expect(prisma.artifactRelation.create).not.toHaveBeenCalled();
  });

  it("can link both workflowRunId and datasetSnapshotId in the same publish call", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "My Component",
      workflowRunId: "wf-run-1",
      datasetSnapshotId: "ds-1",
    });

    expect(prisma.artifactRelation.create).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(prisma.artifactRelation.create).mock.calls;
    const relTypes = calls.map((c) => (c[0] as { data: { relationType: string } }).data.relationType);
    expect(relTypes).toContain("GENERATED_BY");
    expect(relTypes).toContain("INFORMED_BY");
  });
});

describe("publishArtifact — introspection", () => {
  it("includes semanticSummary in the created artifact", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "AuthForm",
      description: "A login form with dark mode",
      tags: ["auth", "form"],
    });

    expect(prisma.publicArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          semanticSummary: expect.any(String),
        }),
      })
    );
    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const data = createCall.data as { semanticSummary?: string };
    expect(data.semanticSummary).toBeTruthy();
  });

  it("uses description as semanticSummary when description is substantive", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "MyButton",
      description: "Accessible button with hover and focus states",
    });

    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const data = createCall.data as { semanticSummary?: string };
    expect(data.semanticSummary).toBe("Accessible button with hover and focus states");
  });

  it("includes componentTree stub in the created artifact", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "PricingCard",
    });

    expect(prisma.publicArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          componentTree: expect.objectContaining({ type: "component", name: "PricingCard" }),
        }),
      })
    );
  });

  it("includes styleSignature with colors and spacing arrays", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "MyComponent",
    });

    expect(prisma.publicArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          styleSignature: expect.objectContaining({
            colors: expect.any(Array),
            spacing: expect.any(Array),
          }),
        }),
      })
    );
  });

  it("logs ARTIFACT_INTROSPECTION_GENERATED governance event", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "DashboardHeader",
    });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_INTROSPECTION_GENERATED",
          details: expect.objectContaining({
            artifactId: "art-1",
            summaryExcerpt: expect.any(String),
          }),
        }),
      })
    );
  });
});
