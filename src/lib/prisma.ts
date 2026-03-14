// Import directly from index to bypass the generated package.json exports map,
// which routes `edge-light` (Turbopack RSC bundler) to wasm.js — a client that
// requires prisma:// URLs. Loading index.js directly always uses the native engine.
import { PrismaClient } from "@/generated/prisma/index.js";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;