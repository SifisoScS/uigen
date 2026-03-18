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

vi.mock("@/actions/generate-artifact-embedding", () => ({
  generateArtifactEmbedding: vi.fn().mockResolvedValue({ artifactId: "art-1", dimensions: 64 }),
}));

vi.mock("@/lib/sifiso-gate", () => ({
  checkWithSovereignGate: vi.fn().mockResolvedValue({
    passed: true,
    ubuntu_score: 0.82,
    failed_predicates: [],
    rationale: "Gate bypassed — SIFISO_OS_URL not configured (development mode).",
    log_entry_id: "0".repeat(64),
    bypassed: true,
  }),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { enforceBranchPolicy } = await import("@/lib/governance/enforce");
const { checkWithSovereignGate } = await import("@/lib/sifiso-gate");
const { generateArtifactEmbedding } = await import("@/actions/generate-artifact-embedding");
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

describe("publishArtifact — Sovereign Gate", () => {
  it("calls checkWithSovereignGate with artifact_publish action", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "AuthForm",
      description: "Accessible auth form",
      tags: ["auth"],
    });

    expect(checkWithSovereignGate).toHaveBeenCalledWith(
      expect.objectContaining({
        uigen_action: "artifact_publish",
        artifact_name: "AuthForm",
        artifact_description: "Accessible auth form",
        tags: ["auth"],
      })
    );
  });

  it("stores ubuntuScore and gateLogEntryId in ARTIFACT_PUBLISHED governance event", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "My Component",
    });

    expect(prisma.governanceEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ARTIFACT_PUBLISHED",
          details: expect.objectContaining({
            ubuntuScore: 0.82,
            gateLogEntryId: "0".repeat(64),
          }),
        }),
      })
    );
  });

  it("throws when gate check fails (passed=false)", async () => {
    vi.mocked(checkWithSovereignGate).mockRejectedValueOnce(
      new Error("Ubuntu alignment gate failed (score 0.450 < θ 0.65). Failed predicates: Ubuntu Alignment.")
    );

    await expect(
      publishArtifact({ projectId: "proj-1", branchName: "release/v1.0", name: "BadComponent" })
    ).rejects.toThrow(/ubuntu alignment gate failed/i);
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

  it("componentTree is extracted from App.tsx (_source present, no _stub)", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "PricingCard",
    });

    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const { componentTree } = createCall.data as { componentTree: Record<string, unknown> };
    // Real extraction: has _source (main file path), no _stub
    expect(componentTree).toHaveProperty("_source", "/App.tsx");
    expect(componentTree).not.toHaveProperty("_stub");
    expect(componentTree).toHaveProperty("type");
  });

  it("componentTree root type is JSXElement and name is the root JSX element tag", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "MyWidget",
    });

    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const { componentTree } = createCall.data as unknown as { componentTree: { type: string; name: string } };
    // PROJECT.data has App.tsx with `return <div>Hello</div>`
    // Real AST extraction: type="JSXElement", name is the element tag
    expect(componentTree.type).toBe("JSXElement");
    expect(componentTree.name).toBe("div");
  });

  it("includes styleSignature with colors, spacing, and classes arrays", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "MyComponent",
    });

    expect(prisma.publicArtifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          styleSignature: expect.objectContaining({
            classes: expect.any(Array),
            colors: expect.any(Array),
            spacing: expect.any(Array),
          }),
        }),
      })
    );
  });

  it("logs ARTIFACT_INTROSPECTION_GENERATED with classCount in details", async () => {
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
            classCount: expect.any(Number),
          }),
        }),
      })
    );
  });

  it("componentTree falls back to stub when no JSX file exists in filesData", async () => {
    // Override project data with no file nodes
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
      ...PROJECT,
      data: JSON.stringify({ type: "directory", name: "/", path: "/", children: {} }),
    } as never);

    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "EmptyProject",
    });

    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const { componentTree } = createCall.data as { componentTree: Record<string, unknown> };
    expect(componentTree).toHaveProperty("_stub", true);
    expect(componentTree).toHaveProperty("name", "EmptyProject");
  });

  it("semanticSummary detects reactive features from filesData", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
      ...PROJECT,
      data: JSON.stringify({
        type: "directory", name: "/", path: "/",
        children: {
          "App.tsx": {
            type: "file", name: "App.tsx", path: "/App.tsx",
            content: `import React, { useState } from 'react';
export default function App() {
  const [open, setOpen] = useState(false);
  return <div className="sm:flex dark:bg-neutral-900 gap-4">Hello</div>;
}`,
          },
        },
      }),
    } as never);

    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "AuthForm",
    });

    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const { semanticSummary } = createCall.data as { semanticSummary: string };
    // Should mention responsive + dark mode + interactive
    expect(semanticSummary).toContain("responsive");
    expect(semanticSummary).toContain("dark mode");
    expect(semanticSummary).toContain("interactive");
  });

  it("governance event includes usedComponentCount in details", async () => {
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
            usedComponentCount: expect.any(Number),
          }),
        }),
      })
    );
  });

  it("extractStyleSignature extracts colors from className strings only", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
      ...PROJECT,
      data: JSON.stringify({
        type: "directory", name: "/", path: "/",
        children: {
          "App.tsx": {
            type: "file", name: "App.tsx", path: "/App.tsx",
            content: `export default function App() {
  return <div className="bg-violet-500 text-neutral-100 gap-4 flex items-center">Hi</div>;
}`,
          },
        },
      }),
    } as never);

    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "ColorTest",
    });

    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const { styleSignature } = createCall.data as unknown as {
      styleSignature: { colors: string[]; spacing: string[]; classes: string[] };
    };
    expect(styleSignature.colors).toContain("bg-violet-500");
    expect(styleSignature.colors).toContain("text-neutral-100");
    expect(styleSignature.spacing).toContain("gap-4");
    expect(styleSignature.classes).toContain("flex");
    expect(styleSignature.classes).toContain("items-center");
  });
});

// ── Registry component & AST tests ───────────────────────────────────────────

const REGISTRY_PROJECT_DATA = JSON.stringify({
  type: "directory", name: "/", path: "/",
  children: {
    "App.tsx": {
      type: "file", name: "App.tsx", path: "/App.tsx",
      content: `import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
export default function App() {
  return (
    <Card>
      <CardContent className="p-6">
        <Button variant="default" size="sm">Click me</Button>
      </CardContent>
    </Card>
  );
}`,
    },
  },
});

describe("publishArtifact — AST component tree", () => {
  it("parses real AST — componentTree has type=JSXElement and _source", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
      ...PROJECT,
      data: REGISTRY_PROJECT_DATA,
    } as never);

    await publishArtifact({ projectId: "proj-1", branchName: "release/v1.0", name: "CardForm" });

    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const { componentTree } = createCall.data as unknown as {
      componentTree: { type: string; name: string; _source: string; children: unknown[] };
    };
    expect(componentTree.type).toBe("JSXElement");
    expect(componentTree.name).toBe("Card");
    expect(componentTree._source).toBe("/App.tsx");
  });

  it("componentTree children contain nested JSX elements (depth > 0)", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
      ...PROJECT,
      data: REGISTRY_PROJECT_DATA,
    } as never);

    await publishArtifact({ projectId: "proj-1", branchName: "release/v1.0", name: "CardForm" });

    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const { componentTree } = createCall.data as unknown as {
      componentTree: { children: Array<{ name: string }> };
    };
    // Card > CardContent > Button — so children[0].name should be CardContent
    expect(componentTree.children.length).toBeGreaterThan(0);
    expect(componentTree.children[0].name).toBe("CardContent");
  });

  it("extracts usedComponents from @/components imports", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
      ...PROJECT,
      data: REGISTRY_PROJECT_DATA,
    } as never);

    await publishArtifact({ projectId: "proj-1", branchName: "release/v1.0", name: "CardForm" });

    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const { styleSignature } = createCall.data as unknown as {
      styleSignature: { usedComponents: string[] };
    };
    expect(styleSignature.usedComponents).toContain("Button");
    expect(styleSignature.usedComponents).toContain("Card");
    expect(styleSignature.usedComponents).toContain("CardContent");
  });

  it("propSummary contains prop names for used components", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
      ...PROJECT,
      data: REGISTRY_PROJECT_DATA,
    } as never);

    await publishArtifact({ projectId: "proj-1", branchName: "release/v1.0", name: "CardForm" });

    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const { styleSignature } = createCall.data as unknown as {
      styleSignature: { propSummary: Record<string, string[]> };
    };
    // Button has variant and size props in the fixture
    expect(styleSignature.propSummary["Button"]).toContain("variant");
    expect(styleSignature.propSummary["Button"]).toContain("size");
  });

  it("graceful fallback when content is not valid JSX", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValueOnce({
      ...PROJECT,
      data: JSON.stringify({
        type: "directory", name: "/", path: "/",
        children: {
          "App.tsx": {
            type: "file", name: "App.tsx", path: "/App.tsx",
            content: "this is { not valid JSX }{}{][",
          },
        },
      }),
    } as never);

    await publishArtifact({ projectId: "proj-1", branchName: "release/v1.0", name: "Broken" });

    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const { componentTree } = createCall.data as unknown as {
      componentTree: { _stub?: boolean };
    };
    // Should not throw — returns stub
    expect(componentTree._stub).toBe(true);
  });

  it("usedComponents is empty when no @/components imports exist", async () => {
    // PROJECT fixture has no registry imports
    await publishArtifact({ projectId: "proj-1", branchName: "release/v1.0", name: "Plain" });

    const createCall = vi.mocked(prisma.publicArtifact.create).mock.calls[0][0];
    const { styleSignature } = createCall.data as unknown as {
      styleSignature: { usedComponents: string[] };
    };
    expect(styleSignature.usedComponents).toEqual([]);
  });
});

// ── Phase 22 — Embedding fire-and-forget ─────────────────────────────────────

describe("publishArtifact — semantic embedding", () => {
  it("calls generateArtifactEmbedding with the new artifact id after publish", async () => {
    await publishArtifact({
      projectId: "proj-1",
      branchName: "release/v1.0",
      name: "My Component",
    });

    expect(generateArtifactEmbedding).toHaveBeenCalledWith({ artifactId: "art-1" });
  });

  it("does not throw when generateArtifactEmbedding rejects (fire-and-forget)", async () => {
    vi.mocked(generateArtifactEmbedding).mockRejectedValueOnce(new Error("Embedding service down"));

    await expect(
      publishArtifact({
        projectId: "proj-1",
        branchName: "release/v1.0",
        name: "My Component",
      })
    ).resolves.toEqual({ artifactId: "art-1" });
  });
});
