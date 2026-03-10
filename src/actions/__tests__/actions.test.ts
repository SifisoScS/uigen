import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: (name: string) => {
        if (name === "x-forwarded-for") return "1.2.3.4";
        return null;
      },
    })
  ),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(async () => "hashed-password"),
    compare: vi.fn(async () => true),
  },
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

const { signIn, signUp, signOut, getUser } = await import("@/actions");
const { prisma } = await import("@/lib/prisma");
const { createSession, deleteSession, getSession } = await import("@/lib/auth");
const { checkRateLimit } = await import("@/lib/rate-limiter");
const bcrypt = (await import("bcrypt")).default;

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockUser = {
  id: "user-1",
  email: "test@example.com",
  password: "hashed-password",
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRateLimit).mockReturnValue({ allowed: true });
});

// ── signUp ────────────────────────────────────────────────────────────────────

describe("signUp", () => {
  it("returns error when rate-limited", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      retryAfterMs: 10_000,
    });
    const result = await signUp("a@b.com", "password123");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/too many attempts/i);
  });

  it("returns error when email is missing", async () => {
    const result = await signUp("", "password123");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  it("returns error when password is too short", async () => {
    const result = await signUp("a@b.com", "short");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/8 characters/i);
  });

  it("returns error when email already exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    const result = await signUp("a@b.com", "password123");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already registered/i);
  });

  it("creates user, hashes password, and starts session on success", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(mockUser);

    const result = await signUp("a@b.com", "password123");

    expect(result.success).toBe(true);
    expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10);
    expect(createSession).toHaveBeenCalledWith(mockUser.id, mockUser.email);
  });

  it("uses IP-based rate limit key", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue(mockUser);

    await signUp("a@b.com", "password123");

    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("1.2.3.4"),
      expect.objectContaining({ maxRequests: 10 })
    );
  });
});

// ── signIn ────────────────────────────────────────────────────────────────────

describe("signIn", () => {
  it("returns error when rate-limited", async () => {
    vi.mocked(checkRateLimit).mockReturnValue({
      allowed: false,
      retryAfterMs: 5_000,
    });
    const result = await signIn("a@b.com", "password123");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/too many attempts/i);
  });

  it("returns error when email is missing", async () => {
    const result = await signIn("", "password123");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/required/i);
  });

  it("returns generic error when user not found (no enumeration)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const result = await signIn("unknown@example.com", "pass");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid credentials/i);
  });

  it("returns error on wrong password", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    const result = await signIn("a@b.com", "wrongpassword");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid credentials/i);
  });

  it("creates session on successful sign-in", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await signIn("a@b.com", "password123");

    expect(result.success).toBe(true);
    expect(createSession).toHaveBeenCalledWith(mockUser.id, mockUser.email);
  });
});

// ── signOut ───────────────────────────────────────────────────────────────────

describe("signOut", () => {
  it("deletes the session", async () => {
    await signOut().catch(() => {
      // redirect() throws in tests — that's fine
    });
    expect(deleteSession).toHaveBeenCalled();
  });
});

// ── getUser ───────────────────────────────────────────────────────────────────

describe("getUser", () => {
  it("returns null when there is no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const user = await getUser();
    expect(user).toBeNull();
  });

  it("returns null when DB lookup fails", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "user-1",
      email: "test@example.com",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error("DB error"));
    const user = await getUser();
    expect(user).toBeNull();
  });

  it("returns user when session and DB record exist", async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: "user-1",
      email: "test@example.com",
      expiresAt: new Date(Date.now() + 3600_000),
    });
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      createdAt: new Date(),
    } as typeof mockUser);

    const user = await getUser();

    expect(user).not.toBeNull();
    expect(user?.email).toBe("test@example.com");
  });
});
