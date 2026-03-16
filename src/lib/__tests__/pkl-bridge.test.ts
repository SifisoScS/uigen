import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Imports ───────────────────────────────────────────────────────────────────

const { writePresenceObservation } = await import("@/lib/pkl-bridge");

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockOk(body: unknown = { written: true }) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

function mockError(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({}),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("writePresenceObservation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SIFISO_OS_URL;
  });

  afterEach(() => {
    delete process.env.SIFISO_OS_URL;
  });

  it("calls POST /api/ikhaya/observe when SIFISO_OS_URL is set", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:8000";
    mockFetch.mockResolvedValueOnce(mockOk());

    await writePresenceObservation({
      key: "uigen:critique_completed:art-1",
      value: { event_type: "critique_completed", artifact_id: "art-1" },
      category: "uigen",
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/ikhaya/observe");
  });

  it("sends key, value, and category in the request body", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:8000";
    mockFetch.mockResolvedValueOnce(mockOk());

    await writePresenceObservation({
      key: "uigen:variant_merged:var-42",
      value: { event_type: "variant_merged", variant_id: "var-42" },
      category: "uigen",
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      key: "uigen:variant_merged:var-42",
      value: { event_type: "variant_merged", variant_id: "var-42" },
      category: "uigen",
    });
  });

  it("uses \"presence\" as the default category when category is omitted", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:8000";
    mockFetch.mockResolvedValueOnce(mockOk());

    await writePresenceObservation({
      key: "presence:generic:id-1",
      value: { note: "hello" },
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.category).toBe("presence");
  });

  it("sends a POST request with Content-Type: application/json", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:8000";
    mockFetch.mockResolvedValueOnce(mockOk());

    await writePresenceObservation({
      key: "forge:build_complete:bp-1",
      value: { build_id: "b-1" },
      category: "forge",
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
  });

  it("strips trailing slash from SIFISO_OS_URL before appending the path", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:8000///";
    mockFetch.mockResolvedValueOnce(mockOk());

    await writePresenceObservation({
      key: "uigen:evaluation_completed:art-2",
      value: { status: "PASSED" },
      category: "uigen",
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/ikhaya/observe");
  });

  it("fails open (no throw) when SIFISO_OS_URL is not set", async () => {
    // SIFISO_OS_URL is deleted in beforeEach — fetch must NOT be called
    await expect(
      writePresenceObservation({
        key: "uigen:critique_completed:art-3",
        value: { event_type: "critique_completed" },
        category: "uigen",
      })
    ).resolves.toBeUndefined();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fails open (no throw) when fetch throws a network error", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:8000";
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      writePresenceObservation({
        key: "uigen:variant_approved:var-5",
        value: { approved: true },
        category: "uigen",
      })
    ).resolves.toBeUndefined();
  });

  it("fails open (no throw) when server returns a non-2xx status", async () => {
    process.env.SIFISO_OS_URL = "http://localhost:8000";
    mockFetch.mockResolvedValueOnce(mockError(500));

    await expect(
      writePresenceObservation({
        key: "uigen:evaluation_completed:art-4",
        value: { status: "FAILED" },
        category: "uigen",
      })
    ).resolves.toBeUndefined();
  });
});
