import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/actions/initiate-from-presence", () => ({
  initiateFromPresence: vi.fn().mockResolvedValue({ actionTaken: "none", narration: "" }),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const { initiateFromPresence } = await import("@/actions/initiate-from-presence");
const { pollOnce, startPresenceListener, stopPresenceListener } =
  await import("@/lib/pkl-listener");

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockObservations(entries: object[]) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(entries),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("pollOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SIFISO_OS_URL;
  });

  afterEach(() => {
    stopPresenceListener();
    delete process.env.SIFISO_OS_URL;
  });

  it("is a no-op and does not call fetch when SIFISO_OS_URL is not set", async () => {
    await pollOnce();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches /api/pkl/observations with a 'since' query param when SIFISO_OS_URL is set", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:8000";
    mockFetch.mockResolvedValueOnce(mockObservations([]));

    await pollOnce();

    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toMatch(/^http:\/\/localhost:8000\/api\/pkl\/observations\?category=uigen&since=\d+$/);
  });

  it("calls initiateFromPresence for each observation returned by the endpoint", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:8000";
    const obs1 = {
      id: "obs-1",
      category: "uigen",
      event_type: "evaluation_completed",
      artifact_id: "art-1",
      status: "FAILED",
    };
    const obs2 = {
      id: "obs-2",
      category: "uigen",
      event_type: "critique_completed",
      artifact_id: "art-2",
      agent_count: 3,
    };
    mockFetch.mockResolvedValueOnce(mockObservations([obs1, obs2]));

    await pollOnce();

    expect(initiateFromPresence).toHaveBeenCalledTimes(2);
    // First call should contain obs1's fields
    const firstArg = (initiateFromPresence as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(firstArg.artifact_id).toBe("art-1");
    expect(firstArg.status).toBe("FAILED");
  });

  it("fails open (no throw) when fetch throws a network error", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:8000";
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(pollOnce()).resolves.toBeUndefined();
    expect(initiateFromPresence).not.toHaveBeenCalled();
  });
});

describe("startPresenceListener / stopPresenceListener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    delete process.env.SIFISO_OS_URL;
    stopPresenceListener(); // ensure clean state
  });

  afterEach(() => {
    stopPresenceListener();
    vi.useRealTimers();
  });

  it("does not allow multiple intervals when called twice", () => {
    process.env.SIFISO_OS_URL = "http://localhost:8000";
    mockFetch.mockResolvedValue({ ok: false });

    startPresenceListener(1000);
    startPresenceListener(1000); // second call is a no-op

    vi.advanceTimersByTime(3000);
    // Only one interval → at most 3 ticks (not 6)
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
