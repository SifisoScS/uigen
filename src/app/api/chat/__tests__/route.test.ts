import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    projectSnapshot: {
      findFirst: vi.fn().mockResolvedValue(null), // no snapshot → no branch → no policy check
      create: vi.fn().mockResolvedValue({ id: "snap-1" }),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    branchPolicy: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ policyType: "OPEN" }),
    },
    governanceEvent: {
      create: vi.fn().mockResolvedValue({ id: "evt-1" }),
    },
  },
}));

vi.mock("@/lib/provider", () => ({
  getLanguageModel: vi.fn(() => ({})),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("ai", () => ({
  streamText: vi.fn(() => ({
    toDataStreamResponse: () => new Response("stream", { status: 200 }),
  })),
  appendResponseMessages: vi.fn(() => []),
  convertToCoreMessages: vi.fn((msgs: unknown[]) => msgs),
}));

vi.mock("@/lib/tools/str-replace", () => ({
  buildStrReplaceTool: vi.fn(() => ({})),
}));

vi.mock("@/lib/tools/file-manager", () => ({
  buildFileManagerTool: vi.fn(() => ({})),
}));

vi.mock("@/lib/prompts/generation", () => ({
  generationPrompt: "You are a test assistant.",
  getGenerationPrompt: () => "You are a test assistant.",
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const { getSession } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { checkRateLimit } = await import("@/lib/rate-limiter");

const validBody = {
  messages: [{ role: "user", content: "Build a button" }],
  files: {},
};

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(null);
    vi.mocked(checkRateLimit).mockReturnValue({ allowed: true });
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null);
  });

  describe("rate limiting", () => {
    it("returns 429 when rate limit is exceeded", async () => {
      vi.mocked(checkRateLimit).mockReturnValue({
        allowed: false,
        retryAfterMs: 30_000,
      });

      const res = await POST(makeRequest(validBody));

      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("30");
      const json = await res.json();
      expect(json.error).toMatch(/too many requests/i);
    });
  });

  describe("input validation", () => {
    it("returns 400 for invalid JSON", async () => {
      const req = new NextRequest("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/invalid json/i);
    });

    it("returns 400 when messages is missing", async () => {
      const res = await POST(makeRequest({ files: {} }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/invalid request body/i);
    });

    it("returns 400 when messages is not an array", async () => {
      const res = await POST(makeRequest({ messages: "hello", files: {} }));
      expect(res.status).toBe(400);
    });

    it("returns 400 when a message is missing role", async () => {
      const res = await POST(
        makeRequest({ messages: [{ content: "hi" }], files: {} })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when files is missing", async () => {
      const res = await POST(
        makeRequest({ messages: [{ role: "user", content: "hi" }] })
      );
      expect(res.status).toBe(400);
    });
  });

  describe("project ownership", () => {
    it("returns 401 when projectId is provided without a session", async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      const res = await POST(
        makeRequest({ ...validBody, projectId: "proj-123" })
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });

    it("returns 404 when projectId does not belong to the authenticated user", async () => {
      vi.mocked(getSession).mockResolvedValue({
        userId: "user-abc",
        email: "test@example.com",
        expiresAt: new Date(Date.now() + 3600_000),
      });
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null);

      const res = await POST(
        makeRequest({ ...validBody, projectId: "proj-other" })
      );
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toMatch(/project not found/i);
    });

    it("proceeds when projectId belongs to the authenticated user", async () => {
      vi.mocked(getSession).mockResolvedValue({
        userId: "user-abc",
        email: "test@example.com",
        expiresAt: new Date(Date.now() + 3600_000),
      });
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "proj-123",
        name: "Test",
        userId: "user-abc",
        public: false,
        messages: "[]",
        data: "{}",
        forkedFromSnapshotId: null,
        remixedFromArtifactId: null,
        status: "DRAFT",
        approvedAt: null,
        approvedBy: null,
        mergedFromVariantId: null,
        mergedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await POST(
        makeRequest({ ...validBody, projectId: "proj-123" })
      );
      expect(res.status).toBe(200);
    });
  });

  describe("happy path", () => {
    it("returns 200 and streams response for a valid anonymous request", async () => {
      const res = await POST(makeRequest(validBody));
      expect(res.status).toBe(200);
    });

    it("uses IP-based rate limit key for anonymous users", async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      await POST(
        makeRequest(validBody, { "x-forwarded-for": "1.2.3.4, 10.0.0.1" })
      );

      expect(checkRateLimit).toHaveBeenCalledWith("ip:1.2.3.4");
    });

    it("uses user-based rate limit key for authenticated users", async () => {
      vi.mocked(getSession).mockResolvedValue({
        userId: "user-abc",
        email: "test@example.com",
        expiresAt: new Date(Date.now() + 3600_000),
      });

      await POST(makeRequest(validBody));

      expect(checkRateLimit).toHaveBeenCalledWith("user:user-abc");
    });
  });
});
