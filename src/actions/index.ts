"use server";

import bcrypt from "bcrypt";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createSession, deleteSession, getSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limiter";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Auth endpoints are brute-force targets — stricter limit: 10 per 15 min.
const AUTH_RATE_LIMIT = { windowMs: 15 * 60_000, maxRequests: 10 };

async function getClientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    h.get("x-real-ip") ??
    "anonymous"
  );
}


export interface AuthResult {
  success: boolean;
  error?: string;
}

export async function signUp(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const ip = await getClientIp();
    const rateLimit = checkRateLimit(`auth-signup:${ip}`, AUTH_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: "Too many attempts. Please wait before trying again.",
      };
    }

    // Validate input
    if (!email || !password) {
      return { success: false, error: "Email and password are required" };
    }

    if (password.length < 8) {
      return {
        success: false,
        error: "Password must be at least 8 characters",
      };
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return { success: false, error: "Email already registered" };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    });

    // Create session
    await createSession(user.id, user.email);

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Sign up error:", error);
    return { success: false, error: "An error occurred during sign up" };
  }
}

export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const ip = await getClientIp();
    const rateLimit = checkRateLimit(`auth-signin:${ip}`, AUTH_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: "Too many attempts. Please wait before trying again.",
      };
    }

    // Validate input
    if (!email || !password) {
      return { success: false, error: "Email and password are required" };
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { success: false, error: "Invalid credentials" };
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return { success: false, error: "Invalid credentials" };
    }

    // Create session
    await createSession(user.id, user.email);

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Sign in error:", error);
    return { success: false, error: "An error occurred during sign in" };
  }
}

export async function signOut() {
  await deleteSession();
  revalidatePath("/");
  redirect("/");
}

export async function getUser() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    return user;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Get user error:", error);
    return null;
  }
}
