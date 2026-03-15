import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    datasetSnapshot: {
      findUnique: vi.fn(),
    },
    artifactRelation: {
      findMany: vi.fn(),
    },
    publicArtifact: {
      findMany: vi.fn(),
    },
    governanceEvent: {
      findMany: vi.fn(),
    },
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { getDatasetSnapshotDetail } = await import("../get-dataset-snapshot-detail");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DS = {
  id: "ds-1",
  name: "AuthForm Training Data",
  description: "Dataset used for training",
  format: "csv",
  rowCount: 500,
  columnSummary: { columns: ["email", "password"], types: ["string", "string"] },
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const ARTIFACT = {
  id: "art-1",
  name: "AuthForm",
  version: "1.0.0",
  projectId: "proj-1",
  branchName: "release/v1.0.0",
  manifest: { governancePolicy: { policyType: "HUMAN_ONLY" } },
  createdAt: new Date("2026-01-01"),
};

const RELATION = {
  id: "rel-1",
  parentType: "DatasetSnapshot",
  parentId: "ds-1",
  childType: "PublicArtifact",
  childId: "art-1",
  relationType: "INFORMED_BY",
  createdAt: new Date("2026-01-01"),
};

const GOV_EVENT = {
  id: "evt-1",
  projectId: "proj-1",
  type: "ARTIFACT_RELATION_CREATED",
  actor: "user-1",
  details: {
    parentType: "DatasetSnapshot",
    parentId: "ds-1",
    childId: "art-1",
    relationType: "INFORMED_BY",
  },
  timestamp: new Date("2026-01-01"),
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.governanceEvent.findMany).mockResolvedValue([] as never);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getDatasetSnapshotDetail", () => {
  it("returns null when DatasetSnapshot does not exist", async () => {
    vi.mocked(prisma.datasetSnapshot.findUnique).mockResolvedValue(null);

    const result = await getDatasetSnapshotDetail("nonexistent");

    expect(result).toBeNull();
  });

  it("returns snapshot data with empty artifacts when no relations exist", async () => {
    vi.mocked(prisma.datasetSnapshot.findUnique).mockResolvedValue(DS as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([] as never);

    const result = await getDatasetSnapshotDetail("ds-1");

    expect(result).not.toBeNull();
    expect(result!.snapshot.id).toBe("ds-1");
    expect(result!.snapshot.name).toBe("AuthForm Training Data");
    expect(result!.snapshot.format).toBe("csv");
    expect(result!.snapshot.rowCount).toBe(500);
    expect(result!.artifacts).toHaveLength(0);
    expect(result!.govEvents).toHaveLength(0);
  });

  it("returns related artifacts with correct relationType", async () => {
    vi.mocked(prisma.datasetSnapshot.findUnique).mockResolvedValue(DS as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([RELATION] as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([ARTIFACT] as never);
    vi.mocked(prisma.governanceEvent.findMany).mockResolvedValue([] as never);

    const result = await getDatasetSnapshotDetail("ds-1");

    expect(result!.artifacts).toHaveLength(1);
    expect(result!.artifacts[0].id).toBe("art-1");
    expect(result!.artifacts[0].name).toBe("AuthForm");
    expect(result!.artifacts[0].relationType).toBe("INFORMED_BY");
  });

  it("filters governance events to only those matching this DatasetSnapshot id", async () => {
    const otherEvent = {
      ...GOV_EVENT,
      id: "evt-other",
      details: {
        parentType: "DatasetSnapshot",
        parentId: "ds-DIFFERENT",
        childId: "art-99",
        relationType: "INFORMED_BY",
      },
    };

    vi.mocked(prisma.datasetSnapshot.findUnique).mockResolvedValue(DS as never);
    vi.mocked(prisma.artifactRelation.findMany).mockResolvedValue([RELATION] as never);
    vi.mocked(prisma.publicArtifact.findMany).mockResolvedValue([ARTIFACT] as never);
    vi.mocked(prisma.governanceEvent.findMany).mockResolvedValue(
      [GOV_EVENT, otherEvent] as never
    );

    const result = await getDatasetSnapshotDetail("ds-1");

    expect(result!.govEvents).toHaveLength(1);
    expect(result!.govEvents[0].id).toBe("evt-1");
  });

  it("preserves columnSummary as a parsed object", async () => {
    vi.mocked(prisma.datasetSnapshot.findUnique).mockResolvedValue(DS as never);

    const result = await getDatasetSnapshotDetail("ds-1");

    expect(result!.snapshot.columnSummary).toEqual({
      columns: ["email", "password"],
      types: ["string", "string"],
    });
  });
});
