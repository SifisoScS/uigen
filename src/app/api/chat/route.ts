import type { UIMessage } from "ai";
import type { FileNode } from "@/lib/file-system";
import { VirtualFileSystem } from "@/lib/file-system";
import { streamText, appendResponseMessages, convertToCoreMessages } from "ai";
import { buildStrReplaceTool } from "@/lib/tools/str-replace";
import { buildFileManagerTool } from "@/lib/tools/file-manager";
import { buildInsertRegistryComponentTool } from "@/lib/tools/insert-registry-component";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getLanguageModel } from "@/lib/provider";
import { getGenerationPrompt } from "@/lib/prompts/generation";
import { checkRateLimit } from "@/lib/rate-limiter";
import { NextRequest, NextResponse } from "next/server";

interface ChatRequest {
  messages: UIMessage[];
  files: Record<string, FileNode>;
  projectId?: string;
}

function parseBody(body: unknown): ChatRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.messages)) return null;
  if (!b.files || typeof b.files !== "object" || Array.isArray(b.files))
    return null;
  const validMessages = b.messages.every(
    (m) =>
      m &&
      typeof m === "object" &&
      "role" in m &&
      typeof (m as Record<string, unknown>).role === "string" &&
      "content" in m
  );
  if (!validMessages) return null;
  return {
    messages: b.messages,
    files: b.files as Record<string, FileNode>,
    projectId: typeof b.projectId === "string" ? b.projectId : undefined,
  };
}

export async function POST(req: NextRequest) {
  // Rate limiting: authenticated users by userId, anonymous by IP
  const session = await getSession();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "anonymous";
  const rateLimitKey = session ? `user:${session.userId}` : `ip:${ip}`;
  const rateLimit = checkRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before sending another message." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rateLimit.retryAfterMs ?? 60_000) / 1000)
          ),
        },
      }
    );
  }

  // Input validation
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const body = parseBody(rawBody);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { messages, files, projectId } = body;

  // Ownership check: if projectId is provided the user must own it
  if (projectId) {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId, userId: session.userId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  // Build CoreMessage array for streamText (prepend system prompt)
  const coreMessages = [
    {
      role: "system" as const,
      content: getGenerationPrompt(),
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    ...convertToCoreMessages(messages),
  ];

  // Reconstruct the VirtualFileSystem from serialized data
  const fileSystem = new VirtualFileSystem();
  fileSystem.deserializeFromNodes(files);

  const model = getLanguageModel();
  const isMockProvider = !process.env.ANTHROPIC_API_KEY;
  const result = streamText({
    model,
    messages: coreMessages,
    maxTokens: 10_000,
    maxSteps: isMockProvider ? 4 : 40,
    onError: ({ error }) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("[chat/stream] error:", error);
      }
    },
    tools: {
      str_replace_editor: buildStrReplaceTool(fileSystem),
      file_manager: buildFileManagerTool(fileSystem),
      insert_registry_component: buildInsertRegistryComponentTool(),
    },
    onFinish: async ({ response }) => {
      if (!projectId || !session) return;

      const responseMessages = response.messages ?? [];
      const allMessages = appendResponseMessages({
        messages: [...messages.filter((m) => m.role !== "system")],
        responseMessages,
      });

      const serializedMessages = JSON.stringify(allMessages);
      const serializedData = JSON.stringify(fileSystem.serialize());

      try {
        await prisma.project.update({
          where: { id: projectId, userId: session.userId },
          data: {
            messages: serializedMessages,
            data: serializedData,
          },
        });
      } catch (error) {
        // Stream has already been sent; log for server-side observability.
        // The client will not lose work — it holds the streamed state in memory.
        console.error("[chat/save] failed to persist project:", {
          projectId,
          userId: session.userId,
          error,
        });
        return;
      }

      // Auto-snapshot: label from last user message, capped at 80 chars.
      // Non-fatal — snapshot failure must not surface to the user.
      try {
        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        const raw: unknown = lastUserMsg?.content;
        let label = "Auto-save";
        if (typeof raw === "string") {
          label = raw.slice(0, 80);
        } else if (Array.isArray(raw)) {
          const textPart = (raw as Array<{ type: string; text?: string }>).find(
            (c) => c.type === "text"
          );
          if (textPart?.text) label = textPart.text.slice(0, 80);
        }

        await prisma.projectSnapshot.create({
          data: { projectId, label, messages: serializedMessages, data: serializedData },
        });

        // Prune: keep only the 50 most recent snapshots
        const older = await prisma.projectSnapshot.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          skip: 50,
          select: { id: true },
        });
        if (older.length > 0) {
          await prisma.projectSnapshot.deleteMany({
            where: { id: { in: older.map((s) => s.id) } },
          });
        }
      } catch (snapshotError) {
        console.error("[chat/snapshot] failed:", snapshotError);
      }
    },
  });

  return result.toDataStreamResponse();
}

export const maxDuration = 120;
