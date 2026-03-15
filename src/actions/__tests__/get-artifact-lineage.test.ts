import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    artifactRelation: {
      findMany: vi.fn(),
    },
    workflowRun: {
      findUnique: vi.fn(),
    },
    datasetSnapshot: {
      findUnique: vi.fn(),
    },
    agentInvocation: {
      findUnique: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { getArtifactLineage, getArtifactLineageDeep } = await import(
  "../get-artifact-lineage"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSummary(id: string, name = `Artifact ${id}`, version = "1.0.0") {
  return { id, name, version, authorId: null, createdAt: new Date("2026-01-01") };
}

/**
 * Makes a full raw artifact suitable for getArtifactLineageDeep mocks.
 * parentArtifactId defaults to null (no parent).
 */
function makeDeepRaw(
  id: string,
  opts: {
    name?: string;
    version?: string;
    parentArtifactId?: string | null;
    semanticSummary?: string | null;
    styleSignature?: unknown;
  } = {}
) {
  return {
    id,
    name: opts.name ?? `Artifact ${id}`,
    version: opts.version ?? "1.0.0",
    description: null,
    authorId: null,
    createdAt: new Date("2026-01-01"),
    remixCount: 0,
    parentArtifactId: opts.parentArtifactId ?? null,
    manifest: { governancePolicy: { policyType: "HUMAN_ONLY" } },
    semanticSummary: opts.semanticSummary ?? null,
    styleSignature: opts.styleSignature ?? null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: findMany returns empty array
  vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.project.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.agentInvocation.findUnique).mockResolvedValue(null);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getArtifactLineage", () => {
  it("throws when artifact does not exist", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);

    await expect(getArtifactLineage("nonexistent")).rejects.toThrow(
      /artifact not found/i
    );
  });

  it("returns null parent and empty children when artifact has no lineage", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue({
      parentArtifactId: null,
    } as never);

    const result = await getArtifactLineage("art-1");

    expect(result.parent).toBeNull();
    expect(result.children).toEqual([]);
  });

  it("returns parent artifact when parentArtifactId is set", async () => {
    vi.mocked(prisma.publicArtifact.findUnique)
      // first call: fetch the artifact to get parentArtifactId
      .mockResolvedValueOnce({ parentArtifactId: "parent-1" } as never)
      // second call: fetch the parent
      .mockResolvedValueOnce(makeSummary("parent-1", "Parent Button") as never);

    const result = await getArtifactLineage("art-1");

    expect(result.parent).not.toBeNull();
    expect(result.parent?.id).toBe("parent-1");
    expect(result.parent?.name).toBe("Parent Button");
  });

  it("returns children (reverse lookup) for an artifact with remixes", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue({
      parentArtifactId: null,
    } as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([
      makeSummary("child-1", "Child A"),
      makeSummary("child-2", "Child B"),
    ] as never);

    const result = await getArtifactLineage("art-root");

    expect(result.children).toHaveLength(2);
    expect(result.children[0].id).toBe("child-1");
    expect(result.children[1].id).toBe("child-2");
    // Verify the children query uses parentArtifactId filter
    expect(prisma.publicArtifact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentArtifactId: "art-root" },
      })
    );
  });

  it("returns both parent and children when both exist", async () => {
    vi.mocked(prisma.publicArtifact.findUnique)
      .mockResolvedValueOnce({ parentArtifactId: "parent-x" } as never)
      .mockResolvedValueOnce(makeSummary("parent-x", "Grand Parent") as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([
      makeSummary("child-y", "My Fork"),
    ] as never);

    const result = await getArtifactLineage("art-middle");

    expect(result.parent?.id).toBe("parent-x");
    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe("child-y");
  });
});

// ── getArtifactLineageDeep ────────────────────────────────────────────────────

describe("getArtifactLineageDeep", () => {
  it("throws when the artifact does not exist", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(null);

    await expect(getArtifactLineageDeep("missing")).rejects.toThrow(
      /artifact not found/i
    );
  });

  it("returns only current when no parents and no children", async () => {
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(
      makeDeepRaw("solo") as never
    );
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);

    const result = await getArtifactLineageDeep("solo");

    expect(result.current.id).toBe("solo");
    expect(result.parents).toHaveLength(0);
    expect(result.children).toHaveLength(0);
    expect(result.depthReached).toBe(false);
  });

  it("walks parent chain up to the requested depth (depth=2)", async () => {
    // Chain: grandparent → parent → current
    const grandparent = makeDeepRaw("gp", { parentArtifactId: null });
    const parent = makeDeepRaw("p1", { parentArtifactId: "gp" });
    const current = makeDeepRaw("cur", { parentArtifactId: "p1" });

    vi.mocked(prisma.publicArtifact.findUnique)
      .mockResolvedValueOnce(current as never)   // fetch current
      .mockResolvedValueOnce(parent as never)    // depth level 0 → direct parent
      .mockResolvedValueOnce(grandparent as never); // depth level 1 → grandparent
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);

    const result = await getArtifactLineageDeep("cur", 2);

    // parents should be oldest-first: [grandparent, parent]
    expect(result.parents).toHaveLength(2);
    expect(result.parents[0].id).toBe("gp");
    expect(result.parents[1].id).toBe("p1");
    expect(result.depthReached).toBe(false); // grandparent has no further parent
  });

  it("sets depthReached=true when chain is deeper than requested depth", async () => {
    // Chain: great-grandparent → grandparent → parent → current, but depth=1
    const parent = makeDeepRaw("p", { parentArtifactId: "gp" }); // parent still has a parent
    const current = makeDeepRaw("c", { parentArtifactId: "p" });

    vi.mocked(prisma.publicArtifact.findUnique)
      .mockResolvedValueOnce(current as never) // fetch current
      .mockResolvedValueOnce(parent as never); // depth level 0
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);

    const result = await getArtifactLineageDeep("c", 1);

    expect(result.parents).toHaveLength(1);
    expect(result.parents[0].id).toBe("p");
    expect(result.depthReached).toBe(true);
  });

  it("detects cycles and stops walking without infinite loop", async () => {
    // Cycle: A's parent is B, B's parent is A
    const nodeA = makeDeepRaw("A", { parentArtifactId: "B" });
    const nodeB = makeDeepRaw("B", { parentArtifactId: "A" }); // cycle back to A

    vi.mocked(prisma.publicArtifact.findUnique)
      .mockResolvedValueOnce(nodeA as never) // fetch current (A)
      .mockResolvedValueOnce(nodeB as never); // fetch B — then A is visited, stops
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);

    // Should resolve without hanging, cycle broken after fetching B
    const result = await getArtifactLineageDeep("A", 7);

    expect(result.parents).toHaveLength(1);
    expect(result.parents[0].id).toBe("B");
    expect(result.depthReached).toBe(false); // stopped due to cycle, not depth
  });

  it("extracts policyType from manifest governancePolicy", async () => {
    const raw = makeDeepRaw("art", { parentArtifactId: null });
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(
      raw as never
    );
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);

    const result = await getArtifactLineageDeep("art");

    expect(result.current.policyType).toBe("HUMAN_ONLY");
  });

  it("clamps depth to max 7", async () => {
    const raw = makeDeepRaw("x", { parentArtifactId: null });
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(
      raw as never
    );
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);

    // Should not throw — depth is silently clamped
    await expect(getArtifactLineageDeep("x", 999)).resolves.toBeDefined();
  });

  it("returns empty crossParents when no ArtifactRelation rows exist", async () => {
    const raw = makeDeepRaw("art");
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(raw as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);

    const result = await getArtifactLineageDeep("art");

    expect(result.crossParents).toEqual([]);
  });

  it("populates crossParents from WorkflowRun ArtifactRelation rows", async () => {
    const raw = makeDeepRaw("art-linked");
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(raw as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([
      {
        id: "rel-1",
        parentType: "WorkflowRun",
        parentId: "wf-99",
        childType: "PublicArtifact",
        childId: "art-linked",
        relationType: "GENERATED_BY",
        createdAt: new Date("2026-01-01"),
      },
    ] as never);
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue({
      id: "wf-99",
      name: "Generate AuthForm",
      outputSummary: "Generated AuthForm with dark mode",
      createdAt: new Date("2026-01-01"),
    } as never);

    const result = await getArtifactLineageDeep("art-linked");

    expect(result.crossParents).toHaveLength(1);
    expect(result.crossParents[0].id).toBe("wf-99");
    expect(result.crossParents[0].parentName).toBe("Generate AuthForm");
    expect(result.crossParents[0].relationType).toBe("GENERATED_BY");
    expect(result.crossParents[0].parentType).toBe("WorkflowRun");
  });

  it("skips ArtifactRelation rows where WorkflowRun is not found", async () => {
    const raw = makeDeepRaw("art-missing-wf");
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(raw as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([
      {
        id: "rel-orphan",
        parentType: "WorkflowRun",
        parentId: "wf-deleted",
        childType: "PublicArtifact",
        childId: "art-missing-wf",
        relationType: "GENERATED_BY",
        createdAt: new Date("2026-01-01"),
      },
    ] as never);
    vi.mocked(prisma.workflowRun.findUnique).mockResolvedValue(null);

    const result = await getArtifactLineageDeep("art-missing-wf");

    expect(result.crossParents).toEqual([]);
  });

  it("populates crossParents from DatasetSnapshot ArtifactRelation rows", async () => {
    const raw = makeDeepRaw("art-ds");
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(raw as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([
      {
        id: "rel-ds-1",
        parentType: "DatasetSnapshot",
        parentId: "ds-42",
        childType: "PublicArtifact",
        childId: "art-ds",
        relationType: "INFORMED_BY",
        createdAt: new Date("2026-01-01"),
      },
    ] as never);
    vi.mocked(prisma.datasetSnapshot.findUnique).mockResolvedValue({
      id: "ds-42",
      name: "AuthForm Training Data",
      createdAt: new Date("2026-01-01"),
    } as never);

    const result = await getArtifactLineageDeep("art-ds");

    expect(result.crossParents).toHaveLength(1);
    expect(result.crossParents[0].id).toBe("ds-42");
    expect(result.crossParents[0].parentName).toBe("AuthForm Training Data");
    expect(result.crossParents[0].relationType).toBe("INFORMED_BY");
    expect(result.crossParents[0].parentType).toBe("DatasetSnapshot");
    expect(result.crossParents[0].outputSummary).toBeNull();
  });

  it("propagates semanticSummary from DB onto ArtifactNode", async () => {
    const raw = makeDeepRaw("art-summary", {
      semanticSummary: "Accessible pricing card with annual toggle",
    });
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(raw as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);

    const result = await getArtifactLineageDeep("art-summary");

    expect(result.current.semanticSummary).toBe("Accessible pricing card with annual toggle");
  });

  it("returns null semanticSummary when field is not set", async () => {
    const raw = makeDeepRaw("art-no-summary");
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(raw as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);

    const result = await getArtifactLineageDeep("art-no-summary");

    expect(result.current.semanticSummary).toBeNull();
  });

  it("extracts firstColor from styleSignature.colors[0]", async () => {
    const raw = makeDeepRaw("art-color", {
      styleSignature: { colors: ["bg-violet-500", "text-neutral-100"], spacing: ["gap-4"] },
    });
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(raw as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);

    const result = await getArtifactLineageDeep("art-color");

    expect(result.current.firstColor).toBe("bg-violet-500");
  });

  it("returns null firstColor when styleSignature has no colors", async () => {
    const raw = makeDeepRaw("art-no-color", {
      styleSignature: { colors: [], spacing: ["gap-4"] },
    });
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(raw as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);

    const result = await getArtifactLineageDeep("art-no-color");

    expect(result.current.firstColor).toBeNull();
  });

  it("returns null firstColor when styleSignature is null", async () => {
    const raw = makeDeepRaw("art-null-sig");
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(raw as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);

    const result = await getArtifactLineageDeep("art-null-sig");

    expect(result.current.firstColor).toBeNull();
  });

  it("skips DatasetSnapshot ArtifactRelation rows where snapshot is not found", async () => {
    const raw = makeDeepRaw("art-missing-ds");
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(raw as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([
      {
        id: "rel-orphan-ds",
        parentType: "DatasetSnapshot",
        parentId: "ds-deleted",
        childType: "PublicArtifact",
        childId: "art-missing-ds",
        relationType: "INFORMED_BY",
        createdAt: new Date("2026-01-01"),
      },
    ] as never);
    vi.mocked(prisma.datasetSnapshot.findUnique).mockResolvedValue(null);

    const result = await getArtifactLineageDeep("art-missing-ds");

    expect(result.crossParents).toEqual([]);
  });
});
