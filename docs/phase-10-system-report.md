# UIGen — Phase 10 System Report & Architectural Recommendations

> Generated after Phase 10 (multi-agent coordination & critique merging).
> Audience: builder / technical founder.

---

## PART I — SYSTEM REPORT

---

### 1. Architectural Strengths

The foundation is structurally sound. UIGen is built on a coherent stack — Next.js App Router + server actions + Prisma — with clear separation between the generation layer (virtual FS + AI tools), the persistence layer (SQLite/Neon via Prisma), and the governance layer (branch policies + events). The decision to make the virtual file system the single source of truth for generated code, with no disk writes, is correct and enables fast, reversible iteration.

**Tool-call discipline is excellent.** The AI never outputs free-form code. It operates exclusively through `str_replace_editor`, `file_manager`, and `insert_registry_component`. This is the right architecture for a generative system: it makes AI mutations structured, auditable, and reversible. Most generative UI systems get this wrong by treating the LLM as a text emitter rather than an agent with constrained operators.

**The virtual file system is the system's most defensible primitive.** It is immutable-by-default (in-memory), serializable (JSON to Prisma), and branchable (snapshots). Everything downstream — previews, governance, artifacts, lineage — is derived from it.

**The registry constraint is underrated.** Forcing Claude to compose from `componentRegistry` entries rather than generating arbitrary Tailwind/HTML is a sovereignty move. It makes outputs predictable, composable, and auditable. The system knows what it can build before it builds it.

---

### 2. Protocol Coherence

The generational loop is well-formed but not yet closed. The full cycle should be:

```
Generate → Publish → Introspect → Critique → Rank → Coordinate → Select →
Materialise Variants → Approve/Reject → Merge → Publish (next generation)
```

**What exists:** Generate → Publish → Introspect → Critique → Rank → Coordinate → Select → Materialise → Approve → Merge (with conflict resolution).

**What is missing to close the loop:** the path from a merged variant back to a published artifact is not automated. A human must manually re-publish. There is no protocol event that says "variant N was merged → trigger next-generation publish." The loop has no terminal closing operator.

Protocol coherence at the event level is strong. Every mutation that matters — publish, remix, critique, variant creation, approval, merge, conflict — emits a `GovernanceEvent`. The audit trail is complete. What is missing is **event-driven reactions**: the system observes but does not act on its own observations.

The `ArtifactRelation` schema (`EVALUATED_BY`, `NEW_VARIANT_OF`, `MERGED_INTO`, `DERIVED_FROM`) is well-designed. The relational graph is directional and typed. However, the relation types are only partially used — the system has the scaffolding for a knowledge graph but is not yet traversing it for intelligence.

---

### 3. Generational Loop Integrity

The generational model is **phase-correct but generationally shallow.** Each generation consists of:

- One artifact (`PublicArtifact`)
- N critiques (`AgentInvocation`)
- M variants (`Project` stubs)
- K approved/merged variants

**The problem: variants are stubs, not full artifacts.** When a variant is created from a critique suggestion, it is a `Project` with `data = artifact.filesData` — the original file content unchanged. No actual code transformation has occurred. The variant project is a copy, not an evolution.

This means the system can **describe** what should change ("Add aria-label to interactive elements") but cannot yet **execute** that change. The generational loop is conceptually closed but materially incomplete. Generation N+1 is identical to generation N until a human opens the variant project and edits it.

**This is the deepest structural gap in the system today.**

The critique pipeline produces ranked, coordinated suggestions. But those suggestions are not connected to the code transformation pipeline. The `str_replace_editor` tool exists and works — but it is only invoked during the initial generation chat, not during variant materialisation.

---

### 4. Multi-Artifact Reasoning

The system has the infrastructure for multi-artifact reasoning — `ArtifactRelation`, cross-parent linking (WorkflowRun, DatasetSnapshot), deep lineage traversal — but is not yet using it for inference.

**What exists:** Artifact A can declare that it was derived from Artifact B (remix/fork), evaluated by an AgentInvocation, or linked to a WorkflowRun or DatasetSnapshot. The graph is buildable.

**What does not exist:** Any reasoning that traverses that graph. If Artifact A and Artifact B share a common ancestor and have both received critiques, no system component currently asks: "What did agents learn about the common ancestor that should inform both descendants?" Multi-artifact reasoning is structurally enabled but semantically absent.

The lineage graph in `LineageGraph.tsx` is a viewer, not a reasoner. The `getArtifactLineageDeep` action fetches the graph but returns it as passive data. Nothing consumes it to produce insight.

---

### 5. Agent-Assisted Critique Design

Phases 8–10 are architecturally correct. The critique pipeline has the right shape:

- Parallel execution per agent (`Promise.all`)
- Per-agent reputation weighting (`finalScore = reputation / priority`)
- Sorted, ranked output
- Coordination (dedup merge via Set)
- Human-gated variant selection

**The reputation model is a stub and needs to become dynamic.** Currently `AGENT_REPUTATION = { Claude: 0.9, Grok: 0.85 }` is hardcoded. There is no mechanism for reputation to change based on outcomes. An agent whose suggestions are consistently accepted by humans should gain reputation. An agent whose suggestions are consistently rejected or produce conflicted merges should lose reputation. Without this feedback loop, the scoring is decorative.

**The merge coordination (`coordinateCritiques`) is correct but shallow.** Set-deduplication is a noise filter, not a synthesis. Two agents saying "Add aria-label" and "Use semantic HTML elements" are not saying the same thing, but both point at the same root cause (accessibility primitives). Real coordination would require semantic clustering — identifying that multiple suggestions address the same dimension — and producing a single, stronger, more specific recommendation.

**The stub/real bifurcation (Grok always stub, Claude real or stub) is technically correct but operationally limited.** As the system scales, all agents should be either real or configurable. The current design hard-codes Grok as permanently synthetic.

---

### 6. Governance Model

The governance model is well-structured for its current scope. Branch prefix rules (`release/` = HUMAN_ONLY, `protected/` = AI_ONLY, other = OPEN) are simple, auditable, and correctly enforced before mutations. Every policy creation and violation attempt is logged.

**The model has three gaps:**

**Gap 1 — Policy applies to branches, not artifacts.** A published `PublicArtifact` has no direct policy. Its governance is derived from the branch it was published from, but once published, the artifact itself has no write protection. There is no "artifact-level immutability" primitive.

**Gap 2 — Governance events are append-only but not reactive.** The `GovernanceEvent` log records that something happened but cannot cause something else to happen. A mature governance model would allow rules like: "If `ARTIFACT_VARIANT_CONFLICT_DETECTED` occurs more than 3 times on a branch, escalate to HUMAN_ONLY." That class of rule is architecturally impossible today.

**Gap 3 — The actor model is binary.** Actors are either `"claude"`, `"human-user"`, or a lowercased agent name. There is no concept of actor identity, trust level, or actor history. The governance model cannot express reputation or trust gradients for human actors.

---

### 7. Lineage Model

The lineage model is the system's strongest conceptual asset. The combination of `parentArtifactId` (direct remix lineage), `ArtifactRelation` (typed relational graph), and `getArtifactLineageDeep` (multi-hop traversal) gives UIGen a richer provenance model than most production AI systems.

**Current capabilities:** ancestry chain, variant graph, cross-type parents (WorkflowRun, DatasetSnapshot), merged variant detection, conflict-resolved node annotation.

**Structural gap:** The lineage is backward-looking only. It tells you where an artifact came from. It does not tell you what an artifact's descendants learned. If Artifact A was remixed into 50 projects and 40 of them added the same pattern, that signal is invisible in the current lineage model. The graph can be traversed upward (ancestors) but not aggregated downward (descendant pattern frequency).

The `filesHash` and `policyHash` fields on `PublicArtifact` are underused. They exist for tamper detection during publish but are never queried for similarity. Two artifacts with the same `filesHash` are structurally identical but the system does not know this.

---

### 8. Conflict Resolution Model

The implementation is correct and complete. `detectConflicts` compares two virtual file systems at the path level, `applyResolutions` applies per-file choices, `buildNestedFS` reconstructs the nested tree, and `ConflictResolution.tsx` presents choices in a side-by-side UI. The governance events (`ARTIFACT_VARIANT_CONFLICT_DETECTED`, `ARTIFACT_VARIANT_CONFLICT_RESOLVED`) provide the audit trail.

**Architectural concern:** conflict resolution is file-level, not semantic-level. The system asks "which file wins?" not "which lines conflict and what is the intent of each change?" This is correct for a first implementation but will become a ceiling as variants become more substantive. When variant files contain actual code modifications (not just copies), file-level resolution is insufficient — you need diff-level merging.

**A deeper concern:** the conflict model assumes two-way merges (original ↔ variant). As the lineage deepens — variant-of-variant-of-artifact — N-way merges become necessary. The current architecture has no path for this.

---

### 9. Test Discipline

**436 tests across 29 test files**, all unit-level with proper module mocking, zero integration tests hitting the real DB (correct for the current scale). The pattern is consistent: mock auth + Prisma at module level, use `as never` casts for Prisma's strict JSON types, use `expect.objectContaining` for partial assertion.

**One gap:** there are no tests for the client-side components (`MultiAgentCritiquePanel`, `ConflictResolution`, `VariantApprovalCard`, `LineageGraph`). These are `"use client"` components with non-trivial state machines. A React Testing Library suite for these would catch regressions that server-action tests cannot.

**No end-to-end tests exist.** The generational loop — generate → publish → critique → variant → merge — has never been tested as a complete flow. Each step is unit-tested in isolation. A Playwright or Cypress suite covering the critical path would provide the integration confidence the system currently lacks.

---

### 10. Hidden Risks & Structural Weaknesses

| Risk | Description |
|---|---|
| **Variants are inert copies** | Every variant is `data = artifact.filesData` — original code, unchanged. The critique pipeline describes evolution without achieving it. |
| **Rate limiter is stateless across instances** | In-memory sliding window resets on restart. In a multi-instance deployment (Vercel serverless), effective limit is `N × 20 req/min`. |
| **Registry search is O(n) in-memory** | `GET /api/registry` fetches all rows then filters in JavaScript. At 10,000 artifacts this becomes a latency problem. No DB-level index on name, tags, or createdAt. |
| **`AgentInvocation` has no `projectId`** | It is a floating record linked via `ArtifactRelation`. Fetching all critiques for a project requires relation traversal, not a direct index lookup. |
| **`filesData` is unbounded** | Large component trees stored as JSON blobs in SQLite with no size limit, compression, or chunking strategy. |
| **Single-branch governance** | No branch policy inheritance or delegation. 50 branches require 50 independent policy records. |

---

## PART II — RECOMMENDATIONS

---

### Priority 1 — Close the Generational Loop (Critical)

**Build: `applyVariantSuggestion` action**

When a variant is created from a critique suggestion, immediately invoke the AI code generation pipeline to apply the suggested change to the copied file system.

```
suggestion: "Add aria-label to interactive elements"
  → prompt: "Apply this change to the component: {suggestion}.
     Current code: {filesData}."
  → streamText with str_replace_editor tools
  → variant.data updated with modified file system
```

This closes the loop: critique → ranked suggestion → coordinated merge → AI-executed transformation → reviewable variant. Without this, variants are proposals. With this, variants are candidates.

**Build: `publishVariantAsArtifact` action**

Once a variant is approved and merged, promote it to a new `PublicArtifact` generation:

```
Generation N: PublicArtifact(art-N)
  → critique → variants → approve → merge
  → publishVariantAsArtifact → PublicArtifact(art-N+1, parentArtifactId=art-N)
```

This is the sovereign generational engine. Each published artifact is a discrete generation with full lineage provenance.

---

### Priority 2 — Dynamic Agent Reputation (High)

**Build: `AgentReputation` model + `updateAgentReputation` action**

Replace the hardcoded `AGENT_REPUTATION` constant with a persistent, outcome-driven ledger:

```prisma
model AgentReputation {
  id            String   @id @default(cuid())
  agentName     String   @unique
  score         Float    @default(0.7)
  acceptedCount Int      @default(0)
  rejectedCount Int      @default(0)
  updatedAt     DateTime @updatedAt
}
```

When a variant is approved → increment the suggesting agent's `acceptedCount` and recalculate score. When rejected → increment `rejectedCount`.

```
score = acceptedCount / (acceptedCount + rejectedCount + 2)   // Laplace smoothing
```

This makes the reputation model self-correcting and grounded in actual human feedback.

---

### Priority 3 — Semantic Similarity & Knowledge Clustering (High)

**Build: `computeArtifactEmbedding` action + `ArtifactEmbedding` model**

The `semanticSummary` field already exists on `PublicArtifact`. Use it to generate embeddings:

```prisma
model ArtifactEmbedding {
  id         String   @id @default(cuid())
  artifactId String   @unique
  vector     Bytes    // serialized Float32Array
  model      String   // embedding model used
  createdAt  DateTime @default(now())
}
```

This enables:

- **Similarity search** — "Find artifacts similar to this one" — critical for remix discovery
- **Cluster detection** — "These 12 artifacts all address the same UI pattern" — enables pattern-level critique
- **Smarter coordination** — `coordinateCritiques` can cluster by cosine similarity instead of exact string match

Without embeddings, the system can only compare artifacts by exact string match (`filesHash`) or human-readable metadata. With embeddings, it can reason about structural and functional similarity.

---

### Priority 4 — Event-Driven Governance Reactions (Medium-High)

**Build: `GovernanceRule` model + `evaluateGovernanceRules` trigger**

```prisma
model GovernanceRule {
  id        String  @id @default(cuid())
  projectId String
  trigger   String  // event type, e.g. "ARTIFACT_VARIANT_CONFLICT_DETECTED"
  condition String  // e.g. "count > 3 in 24h"
  action    String  // e.g. "SET_POLICY:HUMAN_ONLY"
  enabled   Boolean @default(true)
}
```

Initial rules:

- `ARTIFACT_VARIANT_CONFLICT_DETECTED` fires 3+ times in 24h → auto-escalate branch to HUMAN_ONLY
- `ARTIFACT_VARIANT_REJECTED` fires 5+ consecutive times → reduce agent reputation
- `ARTIFACT_PUBLISHED` fires → auto-trigger introspection and critique

This is the difference between a governance log and a governance engine.

---

### Priority 5 — Critique Semantic Merging (Medium)

**Replace Set-dedup with dimension clustering in `coordinateCritiques`**

Build a `clusterSuggestions` utility that groups suggestions by semantic dimension:

```
Dimensions: ACCESSIBILITY | PERFORMANCE | COMPONENT_REUSE | SEMANTICS | VISUAL

"Add aria-label to interactive elements"     → ACCESSIBILITY
"Use semantic HTML elements for controls"    → ACCESSIBILITY (same dimension)
"Replace custom dropdown with shadcn Select" → COMPONENT_REUSE

Merged output:
  "Improve accessibility: add aria-label and use semantic HTML (shared by 2 agents)"
  "Component reuse: replace custom dropdown with shadcn Select"
```

The coordinator becomes an intelligent aggregator, not a noise filter. Initially keyword-based; later embedding-based (cluster by cosine similarity).

---

### Priority 6 — Artifact-Level Immutability & Versioning (Medium)

**Add `status` to `PublicArtifact` and a `freezeArtifact` action**

```
PUBLISHED → FROZEN → DEPRECATED
```

- `FROZEN`: cannot receive new variants, critiques, or relations — a sealed generation
- `DEPRECATED`: superseded by a newer generation

This gives the lineage model temporal semantics: not just "A descended from B" but "B was deprecated when A was published."

---

### Priority 7 — Workflow Orchestration (Medium)

**Build: `CritiqueWorkflow` — a composable, multi-step pipeline**

```ts
type WorkflowStep =
  | { type: "CRITIQUE"; agents: string[] }
  | { type: "COORDINATE" }
  | { type: "SELECT_TOP"; n: number }
  | { type: "MATERIALISE" }
  | { type: "AWAIT_APPROVAL" }

type CritiqueWorkflow = {
  artifactId: string
  steps: WorkflowStep[]
  status: "RUNNING" | "AWAITING_HUMAN" | "COMPLETE" | "FAILED"
}
```

The workflow runs until it hits `AWAIT_APPROVAL`, then pauses and surfaces a decision to the human. Autonomous where safe (critique, coordinate, materialise), human-gated where required (approve, publish). This is the beginning of a proper agentic loop.

---

### Priority 8 — Test Coverage Gaps (Low-Medium)

**Add React Testing Library tests for client components:**

- `MultiAgentCritiquePanel` — state transitions, button enabling/disabling, merged result display
- `ConflictResolution` — file selection, resolution submission
- `VariantApprovalCard` — approve/reject flow, conflict detection trigger
- `LineageGraph` — node rendering, merged badge, conflict-resolved badge

**Add one Playwright end-to-end test covering the critical path:**

```
sign-in → generate component → publish artifact → critique →
select suggestion → approve variant → merge → verify lineage
```

One E2E test on the critical path is worth more than 50 additional unit tests at this stage.

---

### Priority 9 — Protocol-Level Improvements (Medium)

**Add `generationIndex` to `PublicArtifact`.**
An artifact knows its `parentArtifactId` but not whether it is generation 1, 5, or 50. `generationIndex: Int @default(0)` (parent + 1 on publish) enables "show me all generation-3+ artifacts" and powers generational analytics.

**Add `suggestionCount` and `acceptanceRate` to `PublicArtifact`.**
Denormalized counters derived from variant history. "Most evolved" artifacts — those whose suggestions have been consistently accepted — become a first-class sort signal in the registry API.

**Add `critiqueVector` to `AgentInvocation`.**
When embedding infrastructure exists, store the embedding of the merged suggestion. Enables cross-invocation similarity queries: "find all critiques that have historically recommended accessibility improvements to form components."

---

## Summary

| Dimension | Current State | Ceiling Without Next Move |
|---|---|---|
| Generation loop | Structurally present, materially incomplete | Variants are copies, not evolutions |
| Agent pipeline | Critique + rank + coordinate working | Reputation is static, coordination is shallow |
| Governance | Correct, append-only | No reactive rules, no event-driven mutations |
| Lineage | Rich graph, backward-looking only | No descendant aggregation, no pattern detection |
| Similarity | None | Registry is a flat list with no semantic search |
| Conflict resolution | File-level, two-way | Will break on deep lineage N-way merges |
| Test coverage | Strong on server actions | No client component tests, no E2E |

### The two moves that unlock the most leverage

1. **`applyVariantSuggestion`** — makes variants real (AI executes the critique, not just describes it)
2. **`computeArtifactEmbedding`** — makes the knowledge graph queryable (semantic search, clustering, smarter coordination)

Everything else is deepening what already works. These two close the two largest structural gaps: the generational loop has no execution, and the artifact graph has no semantic intelligence.

The system is well-built. The foundation is honest — no fake sophistication, no premature abstraction, no unnecessary coupling. The next phase is intelligence, not infrastructure.
