# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**UIGen** is an AI-powered React component generator with live preview. Users describe UI components in a chat interface; Claude generates and iteratively edits code using tool calls. The result renders in a sandboxed browser preview in real time.

Key capabilities:
- AI-driven file creation and editing via structured tools (no free-form code output)
- In-browser JSX compilation and live component preview
- Virtual (in-memory) file system — no disk I/O for generated code
- Optional persistence via SQLite (authenticated users only)
- Snapshot/branching system with governance policies
- Public artifact registry with remix/fork lineage tracking

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
| `npm run test -- --watch` | Watch mode |
| `npm run test -- --ui` | Open Vitest UI |
| `npm run setup` | Full initial setup (install + prisma generate + migrate) |
| `npm run db:reset` | **Destructive**: wipe and reinitialize database |

To run a single test file: `npm run test -- path/to/file.test.ts`

---

## Architecture Decisions

### Virtual File System

All generated code lives in-memory (`src/lib/file-system.ts`). There are no writes to disk. The `FileSystemContext` holds a `FileSystem` instance that is serialized to JSON for database persistence (authenticated users) or kept in-memory (anonymous users).

### AI Integration Pattern

Claude does **not** output code in chat messages directly. Instead, it calls three tools:

- **`str_replace_editor`** — view, create, str_replace, or insert content into virtual files
- **`file_manager`** — rename or delete virtual files
- **`insert_registry_component`** — insert a registry component into a virtual file by name

Tool definitions live in `src/lib/tools/`. The chat API route (`src/app/api/chat/route.ts`) orchestrates streaming via Vercel AI SDK's `streamText`, with a max of 40 tool steps per request.

### JSX Preview Pipeline

`src/lib/transform/jsx-transformer.ts` compiles the virtual file system contents into a runnable browser bundle:

1. Uses `@babel/standalone` for JSX → JS transformation
2. Generates an `<script type="importmap">` for bare specifier resolution
3. External packages resolve through `esm.sh`
4. `@/` path aliases map to virtual files
5. The resulting HTML is injected into a sandboxed `<iframe>` in `PreviewFrame.tsx`

### Component Registry

`src/lib/registry/index.ts` is a read-only catalogue of all available Shadcn/Radix primitives and higher-level composed blocks. Claude **must** compose generated UIs exclusively from these entries. The registry exports:
- `componentRegistry` — all entries (primitives + blocks)
- `getRegistryList()` — compact string for injecting into system prompts

Blocks live in `src/components/blocks/` (e.g., `PricingCard`, `FeatureGrid`, `AuthForm`, `DashboardHeader`, `SidebarNav`, `DataTable`).

### Starter Templates

`src/lib/templates/` contains 10 pre-built starter templates (dashboard, landing, auth, user-profile, ecommerce, blog-post, settings, saas-analytics, onboarding-wizard, marketing-pricing). Each template is a JSON file with a `files` map of `FileNode` entries. Templates are loaded via `getTemplates()` / `getTemplate(id)`.

### Snapshot & Branch System

Projects support version snapshots and named branches:
- **`ProjectSnapshot`** — point-in-time save of messages + file data; can be pinned, tagged, named, and associated with a branch
- Snapshots track merge provenance (`mergedFromSnapshotId`) and fork provenance (`forkedFromSnapshotId` on `Project`)
- Branch names drive governance policy auto-assignment (see below)

Relevant server actions: `get-snapshots`, `get-snapshot`, `restore-snapshot`, `fork-snapshot`, `update-snapshot`, `set-branch`, `rename-branch`, `fork-project`

### Governance & Branch Policies

`src/lib/governance/enforce.ts` enforces write rules per branch:

| Branch prefix | Default policy |
|---|---|
| (other) | `OPEN` — anyone can write |
| `protected/` | `AI_ONLY` — only AI actors |
| `release/` | `HUMAN_ONLY` — only human actors; direct mutations forbidden except `MERGE`/`PUBLISH` |

Policy types: `OPEN`, `AI_ONLY`, `HUMAN_ONLY`, `LOCKED`. All policy changes and publish events are logged to `GovernanceEvent`. Call `enforceBranchPolicy()` before any mutation action.

### Public Artifact Registry

Published components are stored as `PublicArtifact` records:
- Only publishable from `release/*` branches with `HUMAN_ONLY` policy (authenticated users only)
- `publish-artifact` action computes `filesHash` (SHA-256 of all file paths+contents) and `policyHash` for tamper detection
- Artifacts track `parentArtifactId` for remix lineage; `remixCount` is incremented on remix
- Registry API (`GET /api/registry`) supports search, tag filtering, and sort by `createdAt` or `remixCount`; uses in-memory filtering on SQLite fetched rows (MVP)
- `get-artifact-lineage` action walks the parent chain to return an ancestry list

### State Management

Two React contexts manage global state:

- **`ChatContext`** (`src/lib/contexts/chat-context.tsx`): wraps Vercel AI SDK's `useChat`, exposes messages and submission handler
- **`FileSystemContext`** (`src/lib/contexts/file-system-context.tsx`): owns the `FileSystem` instance; processes tool call results from the chat stream to update files

### Authentication & Rate Limiting

- JWT tokens issued on sign-in, stored in `httpOnly` cookies (7-day expiry)
- `src/lib/auth.ts` is `server-only` — never imported client-side
- Middleware at `src/middleware.ts` guards `/api/projects` and `/api/filesystem`
- `src/lib/rate-limiter.ts` — in-memory sliding-window limiter (default: 20 req/min); auth endpoints use a stricter 10 req/15 min limit
- All auth server actions (`signUp`, `signIn`) apply rate limiting per client IP before any DB work

### Language Model Provider

`src/lib/provider.ts` exports a `getModel()` function. When `ANTHROPIC_API_KEY` is set it returns `claude-sonnet-4-0`; otherwise it returns `MockLanguageModel` for development without API costs.

---

## Database

Prisma with SQLite. Schema is at `prisma/schema.prisma`.

**Models:**
- `User` — id, email, password (hashed)
- `Project` — id, name, userId (optional), public, messages (JSON), data (JSON), forkedFromSnapshotId, remixedFromArtifactId
- `ProjectSnapshot` — id, projectId, label, name, tags, pinned, branchName, isVersionTag, mergedFromSnapshotId, messages, data
- `BranchPolicy` — projectId + branchName (unique), policyType (`OPEN`|`AI_ONLY`|`HUMAN_ONLY`|`LOCKED`)
- `GovernanceEvent` — projectId, type, actor, details (JSON), timestamp
- `PublicArtifact` — id, projectId, branchName, version, name, manifest (JSON), filesData, previewImage, authorId, remixCount, parentArtifactId

**Common commands:**
```bash
npx prisma migrate dev --name <migration-name>   # create and apply a new migration
npx prisma studio                                 # open Prisma Studio GUI
npm run db:reset                                  # wipe DB and re-run migrations (dev only)
```

The Prisma client is generated to `src/generated/prisma` (not the default location). Import it from `src/lib/prisma.ts` which exports a singleton.

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

### Server vs. Client

- Default to React Server Components; add `"use client"` only when needed
- Server actions in `src/actions/` use `"use server"` and interact directly with Prisma
- API routes in `src/app/api/` handle streaming and complex server logic

---

## Testing

Tests use **Vitest** with **React Testing Library** in a **JSDOM** environment. Test files live in `__tests__/` directories next to the code they test.

Key test areas:
- `src/lib/__tests__/file-system.test.ts` — virtual FS CRUD
- `src/lib/__tests__/rate-limiter.test.ts` — rate limiter sliding window
- `src/lib/transform/__tests__/jsx-transformer.test.ts` — JSX compilation and import map
- `src/lib/governance/__tests__/enforce.test.ts` — branch policy enforcement
- `src/lib/contexts/__tests__/` — chat and file system context behaviour
- `src/components/chat/__tests__/` — chat UI rendering
- `src/components/editor/__tests__/` — file tree rendering
- `src/actions/__tests__/` — server action behaviour (publish-artifact, remix-artifact, get-artifact-lineage)
- `src/app/api/chat/__tests__/route.test.ts` — chat route
- `src/app/api/registry/__tests__/route.test.ts` — registry API

---

## Key Files for AI Assistants

| File | Purpose |
|---|---|
| `src/app/api/chat/route.ts` | Chat streaming endpoint — start here for AI flow issues |
| `src/app/api/registry/route.ts` | Public artifact registry GET endpoint |
| `src/lib/file-system.ts` | Virtual FS — all file operations go through this |
| `src/lib/contexts/file-system-context.tsx` | Processes tool calls and updates file state |
| `src/lib/tools/str-replace.ts` | `str_replace_editor` tool definition |
| `src/lib/tools/file-manager.ts` | `file_manager` tool definition |
| `src/lib/tools/insert-registry-component.ts` | `insert_registry_component` tool definition |
| `src/lib/registry/index.ts` | Component catalogue Claude uses when generating UIs |
| `src/lib/templates/index.ts` | Starter template registry |
| `src/lib/governance/enforce.ts` | Branch policy enforcement |
| `src/lib/transform/jsx-transformer.ts` | Preview compilation pipeline |
| `src/lib/prompts/generation.tsx` | System prompt sent to Claude |
| `src/lib/provider.ts` | LLM model selection (real vs. mock) |
| `src/lib/rate-limiter.ts` | In-memory rate limiter |
| `src/components/preview/PreviewFrame.tsx` | Sandboxed preview iframe |
| `prisma/schema.prisma` | Database schema |
| `src/actions/publish-artifact.ts` | Artifact publish flow (governance-gated) |
| `src/actions/remix-artifact.ts` | Fork an artifact into a new project |
| `src/actions/get-artifact-lineage.ts` | Walk parent chain for ancestry |

---

## 100-Repo Vision — Finish Line Roadmap

UIGen's role in the 100-Repo ecosystem is to be the canonical AI-powered UI generation and evaluation node. Every phase below closes a gap between the current implementation and the full set of primitives required for cross-repo reasoning, autonomous governance, and agent evolution.

### Completed phases (1–16)

| Phase | Capability |
|---|---|
| 1–11 | Core generator, virtual FS, governance, snapshots, publish/remix, lineage, multi-agent critique |
| 12 | Publish variant as next-generation artifact (version inheritance) |
| 13 | Dynamic agent reputation — Laplace-smoothed `AgentReputation` table; `recordVariantOutcome` on approve/reject |
| 14 | Reputation-weighted critique merging — `coordinateCritiques` with `WeightedSuggestion`, `topAgentName`, `CRITIQUE_MERGED_INTO` lineage relation |
| 15 | Monaco DiffEditor conflict resolution — `resolvedContent`, auto-merge, per-file manual edits, governance event fields |
| 16 | Semantic variant ranking & auto-selection — `scoreCritiqueSuggestions` with relevance/safety/impact scoring; auto-select button in critique panel |

### Remaining phases — the 8 missing primitives

#### Phase 17 — Evaluation Layer *(Missing — highest priority)*
Introduce `EvaluationRun` for objective quality scoring, regression detection, and evaluation-gated merges.
- **Schema:** `EvaluationRun` (id, artifactId, status PENDING|PASSED|FAILED, metrics JSON, regressionDetected, baselineArtifactId)
- **Actions:** `evaluateArtifact`, `detectRegressions` (compare against parent artifact metrics)
- **Gate:** `release/*` merges must pass evaluation before `publishVariantAsArtifact` proceeds
- **Governance event:** `EVALUATION_RUN_COMPLETED`, `REGRESSION_DETECTED`
- **Key files to create:** `src/actions/evaluate-artifact.ts`, `src/lib/evaluation/` helpers

#### Phase 18 — Workflow Orchestration *(Partial — `WorkflowRun` stub exists)*
Turn `WorkflowRun` into a live multi-step agent sequence runner.
- **Schema:** `WorkflowStep` (id, runId, stepIndex, stepType, inputData, outputData, status, durationMs); `WorkflowDefinition` (stepsJson DAG)
- **Executor:** traverse DAG, run each step (CRITIQUE → SCORE → GENERATE_VARIANTS → EVALUATE), support parallel/sequential scheduling
- **Actions:** `executeWorkflowStep`, `getWorkflowStepDetail`
- **Key existing files:** `src/actions/create-workflow-run.ts`, `src/actions/get-workflow-run-detail.ts`

#### Phase 19 — Descendant Aggregation *(Missing — low schema cost)*
Aggregate what future generations learned from an artifact.
- **Schema:** add `descendantCount Int`, `descendantMetrics Json?` to `PublicArtifact`
- **Actions:** `getArtifactDescendants(depth)` — recursive remix-child walk; `aggregateDescendantMetrics` — average evaluation scores, common issues, success rate across all children
- **Integration:** surface "issues common in prior remixes" inside `MultiAgentCritiquePanel`; use descendant success rate to adjust `AgentReputation`
- **Key existing files:** `src/actions/get-artifact-lineage.ts` (extends ancestor walk to descendants)

#### Phase 20 — Event-Driven Governance *(Partial — events logged, never reacted to)*
Add a reactive rule engine on top of the existing `GovernanceEvent` log.
- **Schema:** `GovernanceRule` (id, eventType trigger, condition JSON, action JSON, enabled)
- **Engine:** `processGovernanceEvent(event)` — match rules, execute actions (auto-freeze branch, auto-trigger critique, auto-demote agent, auto-reject pending merges)
- **Built-in rules:** `EVALUATION_FAILED` → lock `release/*`; `AGENT_REPUTATION_UPDATED` score < 0.4 → demote agent; `ARTIFACT_VARIANT_PUBLISHED` → trigger descendant aggregation
- **Key existing files:** `src/lib/governance/enforce.ts`, `src/actions/get-governance-events.ts`

#### Phase 21 — Agent Specialization *(Partial — reputation is step 1)*
Add per-category skill matrices and role assignment to enable dynamic task routing.
- **Schema:** `AgentSkillMetric` (agentName, category e.g. "accessibility"|"performance"|"ux", score, sampleCount); `AgentRole` (agentName, role REVIEWER|AUTO_PUBLISH|RESTRICTED)
- **Actions:** `analyzeAgentSpecializations` — compute per-category success rates from past `GovernanceEvent` outcomes; `routeCritiqueToSpecialist` — select best-matched agent for artifact type; `assignAgentRoles` — auto-promote/demote
- **Key existing files:** `src/lib/agent-reputation.ts`, `src/actions/critique-artifact.ts`

#### Phase 22 — Semantic Embeddings *(Missing)*
Generate and store vector embeddings for similarity search, clustering, and cross-repo reasoning.
- **Schema:** `ArtifactEmbedding` (artifactId unique, vector Float[], modelVersion, generatedAt) or pgvector column on `PublicArtifact`
- **Actions:** `generateArtifactEmbedding` — embed `semanticSummary + componentTree + styleSignature` via embedding API; `findSimilarArtifacts(artifactId, topK)` — cosine similarity search; `clusterArtifacts` — k-means grouping
- **Integration:** use embeddings to pre-rank critique suggestions; surface "artifacts similar to this" in registry
- **Key existing fields:** `PublicArtifact.semanticSummary`, `PublicArtifact.componentTree`, `PublicArtifact.styleSignature`

#### Phase 23 — Cross-Repo Lineage *(Missing — architecturally most complex)*
Allow `ArtifactRelation` to reference artifacts in external repos; allow workflows to span repos.
- **Schema:** add `externalRepoId String?`, `externalArtifactUrl String?` to `ArtifactRelation`; new `ExternalRepo` model (id, url, apiKey encrypted, lastSyncAt)
- **Actions:** `linkExternalArtifact` — create cross-repo relation; `fetchExternalArtifact` — HTTP GET to remote registry API; `syncExternalLineage` — periodic pull to detect upstream updates
- **Lineage walker:** extend `getArtifactLineageDeep` to follow `externalArtifactUrl` hops
- **Key existing files:** `src/actions/get-artifact-lineage.ts`, `src/app/api/registry/route.ts`

#### Phase 24 — Semantic Transform Trace *(Partial — file-level only)*
Record AST-level structural deltas between artifact generations, not just file hashes.
- **Schema:** `SemanticTransform` (id, fromArtifactId, toArtifactId, addedComponents [], removedComponents [], modifiedProps [], a11yDelta JSON, linesChanged Int)
- **Actions:** `computeSemanticDelta(fromFilesData, toFilesData)` — diff component trees, extract structural changes; called inside `publishVariantAsArtifact`
- **Integration:** surface transform trace in lineage graph; use delta to validate that a suggestion was actually applied; feed into evaluation scoring
- **Key existing files:** `src/lib/artifact-introspection.ts` (AST helpers reusable), `src/actions/publish-variant-as-artifact.ts`

---

### Primitive → phase mapping

| Primitive | Phase |
|---|---|
| Evaluation layer | 17 |
| Workflow orchestration | 18 |
| Descendant aggregation | 19 |
| Event-driven governance | 20 |
| Agent evolution (specialization) | 21 |
| Semantic embeddings | 22 |
| Cross-repo lineage | 23 |
| Semantic transform trace | 24 |

> **Working rule:** always run `npm run test` and `npx tsc --noEmit` before committing. Every phase must leave the test suite green and the TypeScript compiler clean.

---

## Common Pitfalls

1. **Do not import `src/lib/auth.ts` client-side.** It is marked `server-only` and will throw at build time.
2. **The Prisma client is at `src/generated/prisma`**, not the default `@prisma/client`. Always import via `src/lib/prisma.ts`.
3. **Virtual files are in-memory only.** Don't try to `fs.readFile` generated component files — they don't exist on disk.
4. **Shadcn components in `src/components/ui/` are auto-generated.** Edit them via the Shadcn CLI, not by hand.
5. **`npm run db:reset` is destructive.** It drops all data. Never run this against a production database.
6. **`MockLanguageModel` is active when `ANTHROPIC_API_KEY` is unset.** If AI responses seem wrong in dev, check whether the real model is being used.
7. **Publishing requires a `release/*` branch with `HUMAN_ONLY` policy.** `enforceBranchPolicy` will throw otherwise — this is intentional governance.
8. **Registry search/tag filtering is in-memory.** The `GET /api/registry` route fetches all rows then filters in JS. This is a SQLite MVP pattern — don't add DB-level filtering without schema changes.
9. **Rate limiter state is in-process memory.** It resets on server restart and does not share state across multiple instances. Not suitable for production multi-instance deployments without a shared store.
