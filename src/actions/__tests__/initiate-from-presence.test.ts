import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicArtifact: { findUnique: vi.fn() },
    governanceEvent: { create: vi.fn() },
  },
}));

vi.mock("@/actions/critique-artifact", () => ({
  critiqueArtifact: vi.fn().mockResolvedValue({ invocationId: "inv-1", variantIds: [], aggregatedCritiques: [] }),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { prisma } = await import("@/lib/prisma");
const { critiqueArtifact } = await import("@/actions/critique-artifact");
const { initiateFromPresence } = await import("../initiate-from-presence");
const { buildInitiationNarration } = await import("@/lib/ikhaya-narration");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ARTIFACT_LOOKUP = { projectId: "proj-1" };

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("initiateFromPresence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.publicArtifact.findUnique).mockResolvedValue(
      ARTIFACT_LOOKUP as never
    );
    vi.mocked(prisma.governanceEvent.create).mockResolvedValue({} as never);
  });

  it("calls critiqueArtifact when the observation is a FAILED evaluation", async () => {
    const result = await initiateFromPresence({
      id: "obs-1",
      category: "uigen",
      event_type: "evaluation_completed",
      artifact_id: "art-1",
      status: "FAILED",
    });

    expect(critiqueArtifact).toHaveBeenCalledOnce();
    expect(critiqueArtifact).toHaveBeenCalledWith({ artifactId: "art-1" });
    expect(result.actionTaken).toBe("critique_triggered");
  });

  it("does NOT call critiqueArtifact when evaluation status is PASSED", async () => {
    const result = await initiateFromPresence({
      category: "uigen",
      event_type: "evaluation_completed",
      artifact_id: "art-2",
      status: "PASSED",
    });

    expect(critiqueArtifact).not.toHaveBeenCalled();
    expect(result.actionTaken).toBe("none");
  });

  it("logs a PRESENCE_INITIATED governance event with correct details", async () => {
    await initiateFromPresence({
      id: "obs-trigger",
      category: "uigen",
      event_type: "evaluation_completed",
      artifact_id: "art-3",
      status: "FAILED",
    });

    expect(prisma.governanceEvent.create).toHaveBeenCalledOnce();
    const call = vi.mocked(prisma.governanceEvent.create).mock.calls[0][0];
    expect(call.data.type).toBe("PRESENCE_INITIATED");
    expect(call.data.actor).toBe("system");
    expect(call.data.projectId).toBe("proj-1");
    expect(call.data.details).toMatchObject({
      actionTaken: "critique_triggered",
      artifact_id: "art-3",
      triggerObservationId: "obs-trigger",
    });
  });

  it("returns actionTaken 'none' and does not log governance event when no trigger matches", async () => {
    const result = await initiateFromPresence({
      category: "unknown",
      event_type: "something_else",
    });

    expect(result.actionTaken).toBe("none");
    expect(prisma.governanceEvent.create).not.toHaveBeenCalled();
    expect(critiqueArtifact).not.toHaveBeenCalled();
  });
});

describe("buildInitiationNarration", () => {
  it("returns severity 'alert' and triggerType 'evaluation_failed' for FAILED evaluation", () => {
    const narration = buildInitiationNarration({
      category: "uigen",
      event_type: "evaluation_completed",
      artifact_id: "art-x",
      status: "FAILED",
    });

    expect(narration.severity).toBe("alert");
    expect(narration.triggerType).toBe("evaluation_failed");
    expect(narration.artifactId).toBe("art-x");
    expect(narration.message).toContain("art-x");
    expect(narration.message).toContain("critique");
  });

  it("returns triggerType 'mesh_published' and severity 'info' for forge mesh events", () => {
    const narration = buildInitiationNarration({
      category: "forge",
      event_type: "mesh_published",
      artifact_id: "bp-99",
    });

    expect(narration.triggerType).toBe("mesh_published");
    expect(narration.severity).toBe("info");
    expect(narration.message).toContain("mesh artifact");
  });

  it("returns triggerType 'multi_agent_critique' when agent_count > 2", () => {
    const narration = buildInitiationNarration({
      category: "uigen",
      event_type: "critique_completed",
      artifact_id: "art-y",
      agent_count: 4,
    });

    expect(narration.triggerType).toBe("multi_agent_critique");
    expect(narration.severity).toBe("info");
    expect(narration.message).toContain("4 agents");
  });

  it("returns triggerType 'generic' for unrecognised observations", () => {
    const narration = buildInitiationNarration({
      category: "custom",
      event_type: "unknown_event",
    });

    expect(narration.triggerType).toBe("generic");
    expect(narration.severity).toBe("info");
  });
});
