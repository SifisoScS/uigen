import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/actions/get-governance-events", () => ({
  getGovernanceEvents: vi.fn(),
}));

vi.mock("@/actions/get-ikhaya-narrative", () => ({
  getIKhayaNarrative: vi.fn().mockResolvedValue({
    narrative: "The council spoke in the spirit of Ubuntu.",
    confidence: 0.9,
    tone: "affirming",
    references: [],
  }),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { getGovernanceEvents } = await import("@/actions/get-governance-events");
const { getIKhayaNarrative } = await import("@/actions/get-ikhaya-narrative");
const { GovernanceLog } = await import("../GovernanceLog");

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_EVENT = {
  id: "evt-1",
  type: "ARTIFACT_PUBLISHED",
  actor: "user-abc",
  timestamp: new Date(Date.now() - 60_000),
};

function makeEvent(overrides: Partial<typeof BASE_EVENT & { details: unknown }>) {
  return { ...BASE_EVENT, details: null, ...overrides };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GovernanceLog — Ubuntu score badge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows 'U 82' badge on ARTIFACT_PUBLISHED with ubuntuScore=0.82", async () => {
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        details: {
          ubuntuScore: 0.82,
          gateLogEntryId: "a".repeat(64),
        },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    const badge = await screen.findByText("U 82");
    expect(badge).toBeTruthy();
  });

  it("shows 'U —' badge (bypassed) when gateLogEntryId is 64 zeros", async () => {
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        details: {
          ubuntuScore: 0.82,
          gateLogEntryId: "0".repeat(64),
        },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    const badge = await screen.findByText("U —");
    expect(badge).toBeTruthy();
  });

  it("shows truncated gate log entry ID for real (non-bypassed) gate results", async () => {
    const logId = "abcdef1234567890" + "x".repeat(48);
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        details: {
          ubuntuScore: 0.82,
          gateLogEntryId: logId,
        },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    const logEl = await screen.findByText(/gate: abcdef1234567890…/);
    expect(logEl).toBeTruthy();
  });

  it("does NOT show badge on non-gate-aware events (e.g. BRANCH_POLICY_SET)", async () => {
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        type: "BRANCH_POLICY_SET",
        details: { branchName: "release/v1", policyType: "HUMAN_ONLY" },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    await screen.findByText("Policy set");
    expect(screen.queryByText(/^U /)).toBeNull();
  });

  it("does NOT show badge on gate-aware events when ubuntuScore is absent", async () => {
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({ details: { artifactId: "art-1" } }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    await screen.findByText("Published");
    expect(screen.queryByText(/^U /)).toBeNull();
  });

  it("shows emerald badge colour class for score >= 0.75", async () => {
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        details: { ubuntuScore: 0.88, gateLogEntryId: "a".repeat(64) },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    const badge = await screen.findByText("U 88");
    expect(badge.className).toContain("text-emerald-400");
  });

  it("shows amber badge colour class for score >= 0.65 and < 0.75", async () => {
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        details: { ubuntuScore: 0.68, gateLogEntryId: "a".repeat(64) },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    const badge = await screen.findByText("U 68");
    expect(badge.className).toContain("text-amber-400");
  });

  it("shows red badge colour class for score < 0.65", async () => {
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        details: { ubuntuScore: 0.45, gateLogEntryId: "a".repeat(64) },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    const badge = await screen.findByText("U 45");
    expect(badge.className).toContain("text-red-400");
  });

  it("shows badge on ARTIFACT_VARIANT_PUBLISHED", async () => {
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        type: "ARTIFACT_VARIANT_PUBLISHED",
        details: { ubuntuScore: 0.79, gateLogEntryId: "b".repeat(64) },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    const badge = await screen.findByText("U 79");
    expect(badge).toBeTruthy();
  });

  it("shows badge on ARTIFACT_VARIANT_APPROVED", async () => {
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        type: "ARTIFACT_VARIANT_APPROVED",
        details: { ubuntuScore: 0.71, gateLogEntryId: "c".repeat(64) },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    const badge = await screen.findByText("U 71");
    expect(badge).toBeTruthy();
  });

  it("does NOT show gate log ID line when result is bypassed", async () => {
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        details: { ubuntuScore: 0.82, gateLogEntryId: "0".repeat(64) },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    await screen.findByText("U —");
    expect(screen.queryByText(/gate:/)).toBeNull();
  });
});

describe("GovernanceLog — iKhaya AI explain panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Explain button on gate-aware events with ubuntuScore", async () => {
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        details: { ubuntuScore: 0.82, gateLogEntryId: "a".repeat(64) },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    const btn = await screen.findByText("Explain");
    expect(btn).toBeTruthy();
  });

  it("does NOT show Explain button on non-gate-aware events", async () => {
    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        type: "BRANCH_POLICY_SET",
        details: { branchName: "release/v1", policyType: "HUMAN_ONLY" },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    await screen.findByText("Policy set");
    expect(screen.queryByText("Explain")).toBeNull();
  });

  it("calls getIKhayaNarrative and shows narrative when Explain is clicked", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        details: { ubuntuScore: 0.82, gateLogEntryId: "b".repeat(64) },
      }),
    ] as never);
    vi.mocked(getIKhayaNarrative).mockResolvedValue({
      narrative: "The council spoke in the spirit of Ubuntu.",
      confidence: 0.9,
      tone: "affirming",
      references: [],
    });

    render(<GovernanceLog projectId="proj-1" />);
    const btn = await screen.findByText("Explain");
    await user.click(btn);

    const narrative = await screen.findByText("The council spoke in the spirit of Ubuntu.");
    expect(narrative).toBeTruthy();
    expect(vi.mocked(getIKhayaNarrative)).toHaveBeenCalledWith(
      expect.objectContaining({ ubuntuScore: 0.82 })
    );
  });

  it("toggles narrative panel off when Explain is clicked again", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    vi.mocked(getGovernanceEvents).mockResolvedValue([
      makeEvent({
        details: { ubuntuScore: 0.82, gateLogEntryId: "c".repeat(64) },
      }),
    ] as never);

    render(<GovernanceLog projectId="proj-1" />);
    const btn = await screen.findByText("Explain");

    await user.click(btn);
    const hideBtn = await screen.findByText("Hide");
    expect(hideBtn).toBeTruthy();

    await user.click(hideBtn);
    expect(screen.queryByText("Hide")).toBeNull();
    expect(screen.queryByText("Explain")).toBeTruthy();
  });
});
