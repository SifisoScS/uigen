# CLAUDE.md — UIGen Codebase Guide

This file provides guidance for AI assistants (Claude and others) working in this repository.

---

## Project Overview

**UIGen** is an AI-powered React component generator with live preview. Users describe UI components in a chat interface; Claude generates and iteratively edits code using tool calls. The result renders in a sandboxed browser preview in real time.

Key capabilities:
- AI-driven file creation and editing via structured tools (no free-form code output)
- In-browser JSX compilation and live component preview
- Virtual (in-memory) file system — no disk I/O for generated code
- Optional persistence via SQLite (authenticated users only)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5 (strict mode) |
| UI | React 19, Tailwind CSS v4, Radix UI, Shadcn UI |
| AI/LLM | Anthropic Claude via `@ai-sdk/anthropic` + Vercel AI SDK |
| ORM | Prisma 6 with SQLite |
| Auth | JWT (jose) + bcrypt, httpOnly cookies |
| Testing | Vitest 3 + React Testing Library + JSDOM |
| Editor | Monaco Editor (`@monaco-editor/react`) |
| JSX Compiler | `@babel/standalone` (browser runtime) |

---

## Repository Structure

```
/
├── prisma/
│   ├── schema.prisma          # DB schema (User, Project models)
│   └── migrations/            # SQLite migration history
├── src/
│   ├── actions/               # Next.js server actions
│   │   ├── create-project.ts
│   │   ├── get-project.ts
│   │   └── get-projects.ts
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx           # Home page (new project entry point)
│   │   ├── main-content.tsx   # Root split-panel UI layout
│   │   ├── [projectId]/page.tsx  # Per-project route
│   │   └── api/chat/route.ts  # Streaming chat endpoint (POST)
│   ├── components/
│   │   ├── ui/                # Shadcn UI primitives (do not modify manually)
│   │   ├── auth/              # AuthDialog, SignInForm, SignUpForm
│   │   ├── chat/              # ChatInterface, MessageInput, MessageList, MarkdownRenderer
│   │   ├── editor/            # CodeEditor, FileTree
│   │   └── preview/           # PreviewFrame (sandboxed iframe)
│   ├── hooks/
│   │   └── use-auth.ts
│   ├── lib/
│   │   ├── contexts/          # React contexts: chat-context, file-system-context
│   │   ├── prompts/           # System prompt for Claude (generation.tsx)
│   │   ├── tools/             # AI tool definitions: str-replace.ts, file-manager.ts
│   │   ├── transform/         # jsx-transformer.ts (Babel-based preview compiler)
│   │   ├── auth.ts            # JWT helpers (server-only)
│   │   ├── file-system.ts     # Virtual file system implementation
│   │   ├── prisma.ts          # Prisma client singleton
│   │   └── provider.ts        # LLM provider (Anthropic or MockLanguageModel)
│   └── middleware.ts          # Route protection for /api/projects, /api/filesystem
├── components.json            # Shadcn UI config
├── next.config.ts
├── vitest.config.mts
└── package.json
```

---

## Development Setup

```bash
npm run setup     # install deps + generate Prisma client + run DB migrations
npm run dev       # start Next.js dev server (Turbopack)
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | No | — | Enables real Claude responses; omit to use mock model |
| `JWT_SECRET` | No | `development-secret-key` | Signs session JWTs |
| `NODE_ENV` | No | `development` | Set to `production` to enable secure cookies |

If `ANTHROPIC_API_KEY` is absent, the app falls back to `MockLanguageModel`, which returns static demo component tool calls.

---

## Scripts Reference

| Script | Description |
|---|---|
| `npm run dev` | Dev server with Turbopack |
| `npm run dev:daemon` | Dev server in background, logs to `logs.txt` |
| `npm run build` | Production build |
| `npm run start` | Run production server |
| `npm run lint` | ESLint (Next.js config) |
| `npm run test` | Run Vitest suite |
| `npm run setup` | Full initial setup (install + prisma generate + migrate) |
| `npm run db:reset` | **Destructive**: wipe and reinitialize database |

---

## Architecture Decisions

### Virtual File System

All generated code lives in-memory (`src/lib/file-system.ts`). There are no writes to disk. The `FileSystemContext` holds a `FileSystem` instance that is serialized to JSON for database persistence (authenticated users) or kept in-memory (anonymous users).

### AI Integration Pattern

Claude does **not** output code in chat messages directly. Instead, it calls two tools:

- **`str_replace_editor`** — view, create, str_replace, or insert content into virtual files
- **`file_manager`** — rename or delete virtual files

Tool definitions live in `src/lib/tools/`. The chat API route (`src/app/api/chat/route.ts`) orchestrates streaming via Vercel AI SDK's `streamText`, with a max of 40 tool steps per request.

### JSX Preview Pipeline

`src/lib/transform/jsx-transformer.ts` compiles the virtual file system contents into a runnable browser bundle:

1. Uses `@babel/standalone` for JSX → JS transformation
2. Generates an `<script type="importmap">` for bare specifier resolution
3. External packages resolve through `esm.sh`
4. `@/` path aliases map to virtual files
5. The resulting HTML is injected into a sandboxed `<iframe>` in `PreviewFrame.tsx`

### State Management

Two React contexts manage global state:

- **`ChatContext`** (`src/lib/contexts/chat-context.tsx`): wraps Vercel AI SDK's `useChat`, exposes messages and submission handler
- **`FileSystemContext`** (`src/lib/contexts/file-system-context.tsx`): owns the `FileSystem` instance; processes tool call results from the chat stream to update files

### Authentication

- JWT tokens issued on sign-in, stored in `httpOnly` cookies (7-day expiry)
- `src/lib/auth.ts` is `server-only` — never imported client-side
- Middleware at `src/middleware.ts` guards `/api/projects` and `/api/filesystem`
- Projects are associated with users but `userId` is optional (supports anonymous sessions)

### Language Model Provider

`src/lib/provider.ts` exports a `getModel()` function. When `ANTHROPIC_API_KEY` is set it returns `claude-sonnet-4-0`; otherwise it returns `MockLanguageModel` for development without API costs.

---

## Coding Conventions

### TypeScript

- Strict mode is enabled — no implicit `any`, no unchecked assignments
- Path alias `@/*` → `src/*` (configured in `tsconfig.json` and Vitest)
- Server-only modules use the `"server-only"` package to prevent accidental client import

### Component Structure

- Shadcn UI components in `src/components/ui/` — do not modify these manually; use the Shadcn CLI to add/update primitives
- Feature components live in their own subdirectory (`chat/`, `editor/`, `preview/`, `auth/`)
- Co-locate tests in `__tests__/` subdirectories adjacent to the source files they test

### Styling

- Tailwind CSS v4 — use utility classes exclusively
- `clsx` + `tailwind-merge` via `src/lib/utils.ts` `cn()` helper for conditional classes
- `class-variance-authority` (CVA) for component variants in Shadcn primitives

### Server vs. Client

- Default to React Server Components; add `"use client"` only when needed (interactivity, hooks, browser APIs)
- Server actions in `src/actions/` use `"use server"` and interact directly with Prisma
- API routes in `src/app/api/` handle streaming and complex server logic

---

## Testing

Tests use **Vitest** with **React Testing Library** in a **JSDOM** environment.

```bash
npm run test              # run all tests once
npm run test -- --watch   # watch mode
npm run test -- --ui      # open Vitest UI
```

Test files are placed in `__tests__/` directories next to the code they test (e.g., `src/lib/transform/__tests__/jsx-transformer.test.ts`).

Key test areas:
- `src/lib/__tests__/file-system.test.ts` — virtual file system CRUD operations
- `src/lib/transform/__tests__/jsx-transformer.test.ts` — JSX compilation and import map generation
- `src/lib/contexts/__tests__/` — chat and file system context behaviour
- `src/components/chat/__tests__/` — chat UI component rendering
- `src/components/editor/__tests__/` — file tree rendering

When adding new features, add corresponding tests. Aim to cover happy paths and error cases for any utility or context logic.

---

## Database

Prisma with SQLite. Schema is at `prisma/schema.prisma`.

**Models:**
- `User` — id, email, password (hashed), createdAt, updatedAt
- `Project` — id, name, userId (optional FK → User), messages (JSON), data (JSON), createdAt, updatedAt

**Common commands:**
```bash
npx prisma migrate dev --name <migration-name>   # create and apply a new migration
npx prisma studio                                 # open Prisma Studio GUI
npm run db:reset                                  # wipe DB and re-run migrations (dev only)
```

The Prisma client is generated to `src/generated/prisma` (not the default location). Import it from `src/lib/prisma.ts` which exports a singleton.

---

## Key Files for AI Assistants

When implementing features or debugging, these files are most frequently relevant:

| File | Purpose |
|---|---|
| `src/app/api/chat/route.ts` | Chat streaming endpoint — start here for AI flow issues |
| `src/lib/file-system.ts` | Virtual FS — all file operations go through this |
| `src/lib/contexts/file-system-context.tsx` | Processes tool calls and updates file state |
| `src/lib/tools/str-replace.ts` | Definition of the `str_replace_editor` tool |
| `src/lib/tools/file-manager.ts` | Definition of the `file_manager` tool |
| `src/lib/transform/jsx-transformer.ts` | Preview compilation pipeline |
| `src/lib/prompts/generation.tsx` | System prompt sent to Claude |
| `src/lib/provider.ts` | LLM model selection (real vs. mock) |
| `src/components/preview/PreviewFrame.tsx` | Sandboxed preview iframe |
| `prisma/schema.prisma` | Database schema |

---

## Common Pitfalls

1. **Do not import `src/lib/auth.ts` client-side.** It is marked `server-only` and will throw at build time.
2. **The Prisma client is at `src/generated/prisma`**, not the default `@prisma/client`. Always import via `src/lib/prisma.ts`.
3. **Virtual files are in-memory only.** Don't try to `fs.readFile` generated component files — they don't exist on disk.
4. **Shadcn components in `src/components/ui/` are auto-generated.** Edit them via the Shadcn CLI, not by hand.
5. **`npm run db:reset` is destructive.** It drops all data. Never run this against a production database.
6. **`MockLanguageModel` is active when `ANTHROPIC_API_KEY` is unset.** If AI responses seem wrong in dev, check whether the real model is being used.
