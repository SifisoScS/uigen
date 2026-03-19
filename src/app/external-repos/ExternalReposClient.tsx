"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Plus, Zap, CheckCircle, XCircle, Loader2, Server, Key, RefreshCw, Trash2 } from "lucide-react";
import { registerExternalRepo, deleteExternalRepo } from "@/actions/register-external-repo";
import { requestDistributedBuild } from "@/actions/request-distributed-build";
import { cn } from "@/lib/utils";

interface Repo {
  id: string;
  name: string;
  url: string;
  nodeId: string | null;
  publicKey: string | null;
  lastSyncAt: Date | null;
  createdAt: Date;
}

interface RegisterResult {
  id: string;
  name: string;
  alreadyExisted: boolean;
}

interface BuildResult {
  proposal: { proposal_id: string };
  vote: { vote: string; quorum_votes?: number; quorum_passed?: boolean };
  task: { task_id: string; assigned_node_did: string };
  orchestration: { candidate_nodes: string[] } | null;
}

export function ExternalReposClient({ initialRepos }: { initialRepos: Repo[] }) {
  const router = useRouter();
  const repos = initialRepos;

  // ── Register form state ──────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerResult, setRegisterResult] = useState<RegisterResult | null>(null);
  const [isRegistering, startRegister] = useTransition();

  // ── Delete state ─────────────────────────────────────────────────────────────
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();

  // ── Re-register state ────────────────────────────────────────────────────────
  const [reregisterStatus, setReregisterStatus] = useState<Record<string, "ok" | "err" | null>>({});
  const [isReregistering, startReregister] = useTransition();

  // ── Build state ──────────────────────────────────────────────────────────────
  const [buildRepoId, setBuildRepoId] = useState<string | null>(null);
  const [artifactId, setArtifactId] = useState("");
  const [lastArtifactId, setLastArtifactId] = useState<Record<string, string>>({});
  const [buildResult, setBuildResult] = useState<Record<string, BuildResult | null>>({});
  const [buildError, setBuildError] = useState<Record<string, string | null>>({});
  const [isBuilding, startBuild] = useTransition();

  const handleRegister = () => {
    setRegisterError(null);
    setRegisterResult(null);
    startRegister(async () => {
      try {
        const result = await registerExternalRepo({
          name: name.trim(),
          url: url.trim(),
          apiKey: apiKey.trim() || undefined,
        });
        setRegisterResult(result);
        setName("");
        setUrl("");
        setApiKey("");
        router.refresh();
      } catch (err) {
        setRegisterError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const handleDelete = (repoId: string) => {
    setIsDeletingId(repoId);
    startDelete(async () => {
      await deleteExternalRepo(repoId);
      router.refresh();
    });
  };

  const handleReregister = (repo: Repo) => {
    setReregisterStatus((s) => ({ ...s, [repo.id]: null }));
    startReregister(async () => {
      try {
        await registerExternalRepo({ name: repo.name, url: repo.url });
        setReregisterStatus((s) => ({ ...s, [repo.id]: "ok" }));
        router.refresh();
      } catch {
        setReregisterStatus((s) => ({ ...s, [repo.id]: "err" }));
      }
    });
  };

  const handleBuild = (repoId: string, overrideArtifactId?: string) => {
    const aid = overrideArtifactId ?? (artifactId.trim() || `mesh:art-${Date.now()}`);
    setBuildError((e) => ({ ...e, [repoId]: null }));
    setBuildResult((r) => ({ ...r, [repoId]: null }));
    setLastArtifactId((m) => ({ ...m, [repoId]: aid }));
    startBuild(async () => {
      try {
        const result = await requestDistributedBuild(repoId, aid);
        setBuildResult((r) => ({ ...r, [repoId]: result as BuildResult }));
      } catch (err) {
        setBuildError((e) => ({ ...e, [repoId]: err instanceof Error ? err.message : String(err) }));
      } finally {
        setBuildRepoId(null);
        setArtifactId("");
      }
    });
  };

  return (
    <div className="space-y-8">

      {/* ── Register form ─────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur-xl">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white">
              <Plus className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-white/40 uppercase tracking-[0.28em]">Add node</p>
              <h2 className="text-sm font-semibold text-white">Register Sifiso OS Node</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] text-white/45 uppercase tracking-[0.24em]">Name</label>
              <input
                placeholder="Sifiso OS Alpha"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-9 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20 focus:bg-white/8 transition"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-white/45 uppercase tracking-[0.24em]">Node URL</label>
              <input
                placeholder="http://localhost:8000"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full h-9 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20 focus:bg-white/8 transition font-mono"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-[11px] text-white/45 uppercase tracking-[0.24em]">
                API Key <span className="text-white/25">(optional)</span>
              </label>
              <input
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full h-9 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20 focus:bg-white/8 transition font-mono"
                type="password"
              />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={handleRegister}
              disabled={isRegistering || !name.trim() || !url.trim()}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_24px_rgba(99,102,241,0.25)]"
            >
              {isRegistering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              {isRegistering ? "Handshaking…" : "Register & Handshake"}
            </button>

            {registerResult && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle className="h-3.5 w-3.5" />
                {registerResult.alreadyExisted ? `Updated: ${registerResult.name}` : "Registered successfully"}
              </span>
            )}
            {registerError && (
              <span className="flex items-center gap-1.5 text-xs text-red-400">
                <XCircle className="h-3.5 w-3.5" />
                {registerError}
              </span>
            )}
          </div>

          <p className="mt-4 text-[11px] text-white/30 leading-5">
            UIGen will POST to{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-white/50">/mesh/handshake</code>
            {" "}using its Ed25519 identity (§22.4). The remote DID and public key are stored for signature verification.
          </p>
        </div>
      </section>

      {/* ── Registered nodes ──────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <p className="text-[11px] text-white/35 uppercase tracking-[0.28em] font-medium">
            Registered Nodes
          </p>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/45">
            {repos.length}
          </span>
        </div>

        {repos.length === 0 ? (
          <div className="text-center py-16 rounded-[28px] border border-dashed border-white/10 bg-white/[0.02]">
            <Server className="h-8 w-8 mx-auto mb-3 text-white/20" />
            <p className="text-sm font-medium text-white/35">No nodes registered yet</p>
            <p className="text-xs mt-1 text-white/20">Register a Sifiso OS node above to begin.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {repos.map((repo) => (
              <div key={repo.id} className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] backdrop-blur-xl">
                <div className="p-5">
                  {/* Node header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{repo.name}</span>
                        {repo.nodeId ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                            <CheckCircle className="h-2.5 w-2.5" /> Handshaked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-400/10 text-amber-400 border border-amber-400/20">
                            <XCircle className="h-2.5 w-2.5" /> No handshake
                          </span>
                        )}
                      </div>
                      <a
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-white/35 hover:text-white/60 transition mt-0.5 inline-block font-mono"
                      >
                        {repo.url}
                      </a>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Re-register */}
                      <button
                        onClick={() => handleReregister(repo)}
                        disabled={isReregistering || isDeleting}
                        title="Re-handshake to refresh node DID and public key"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-2xl border border-white/10 bg-white/5 text-white/45 transition hover:bg-white/10 hover:text-white/70 disabled:opacity-40"
                      >
                        {isReregistering
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <RefreshCw className={cn("h-3 w-3", reregisterStatus[repo.id] === "ok" && "text-emerald-400")} />
                        }
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(repo.id)}
                        disabled={isDeleting || isBuilding}
                        title="Remove this node"
                        className="inline-flex items-center justify-center h-8 w-8 rounded-2xl border border-white/10 bg-white/5 text-white/35 transition hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 disabled:opacity-40"
                      >
                        {isDeleting && isDeletingId === repo.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Trash2 className="h-3 w-3" />
                        }
                      </button>
                      {/* Distributed Build */}
                      <button
                        onClick={() => setBuildRepoId(buildRepoId === repo.id ? null : repo.id)}
                        disabled={isBuilding || isDeleting}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-2xl border px-3 py-1.5 text-xs font-medium transition",
                          buildRepoId === repo.id
                            ? "border-violet-500/30 bg-violet-500/10 text-violet-400"
                            : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <Zap className="h-3 w-3" />
                        Distributed Build
                      </button>
                    </div>
                  </div>

                  {/* Node identity */}
                  {repo.nodeId && (
                    <div className="mt-4 space-y-1.5 rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center gap-2">
                        <Server className="h-3 w-3 text-white/30 flex-shrink-0" />
                        <code className="text-[11px] text-white/45 truncate">{repo.nodeId}</code>
                      </div>
                      {repo.publicKey && (
                        <div className="flex items-center gap-2">
                          <Key className="h-3 w-3 text-white/30 flex-shrink-0" />
                          <code className="text-[11px] text-white/35 truncate">{repo.publicKey.slice(0, 32)}…</code>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Distributed Build panel */}
                  {buildRepoId === repo.id && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <p className="text-[10px] text-white/35 uppercase tracking-[0.24em] mb-3">
                        Run distributed build — §18–§21
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          placeholder="Artifact ID (e.g. mesh:art-001) — leave blank to auto-generate"
                          value={artifactId}
                          onChange={(e) => setArtifactId(e.target.value)}
                          className="flex-1 h-8 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs text-white placeholder:text-white/25 outline-none focus:border-white/20 font-mono"
                        />
                        <button
                          onClick={() => handleBuild(repo.id)}
                          disabled={isBuilding}
                          className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50 flex-shrink-0"
                        >
                          {isBuilding
                            ? <><Loader2 className="h-3 w-3 animate-spin" /> Running…</>
                            : <><Zap className="h-3 w-3" /> Run</>
                          }
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Build result */}
                  {buildResult[repo.id] && (
                    <>
                      <BuildResultPanel result={buildResult[repo.id]!} />
                      <div className="mt-3">
                        <button
                          onClick={() => handleBuild(repo.id, lastArtifactId[repo.id])}
                          disabled={isBuilding}
                          className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/55 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                        >
                          {isBuilding ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          Re-run ({lastArtifactId[repo.id]})
                        </button>
                      </div>
                    </>
                  )}

                  {buildError[repo.id] && (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                        {buildError[repo.id]}
                      </div>
                      {lastArtifactId[repo.id] && (
                        <button
                          onClick={() => handleBuild(repo.id, lastArtifactId[repo.id])}
                          disabled={isBuilding}
                          className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/55 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                        >
                          {isBuilding ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          Re-run
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BuildResultPanel({ result }: { result: BuildResult }) {
  return (
    <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
      <p className="text-[10px] font-medium text-white/35 uppercase tracking-[0.24em]">Build Result</p>

      {result.orchestration && (
        <ResultRow
          label="Orchestration"
          status="ok"
          detail={`${result.orchestration.candidate_nodes.length} candidate(s): ${result.orchestration.candidate_nodes[0]?.slice(0, 32)}…`}
        />
      )}
      <ResultRow label="Proposal" status="ok" detail={`ID: ${result.proposal.proposal_id}`} />
      <ResultRow
        label="Quorum Vote"
        status={result.vote.vote === "approve" ? "ok" : "fail"}
        detail={[
          result.vote.vote,
          result.vote.quorum_votes != null ? `${result.vote.quorum_votes} vote(s)` : null,
          result.vote.quorum_passed != null ? (result.vote.quorum_passed ? "quorum passed" : "quorum failed") : null,
        ].filter(Boolean).join(" · ")}
      />
      <ResultRow
        label="Forge Task"
        status="ok"
        detail={`Assigned → ${result.task.assigned_node_did.slice(0, 36)}…`}
      />
    </div>
  );
}

function ResultRow({ label, status, detail }: { label: string; status: "ok" | "fail"; detail: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2.5">
      {status === "ok"
        ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
        : <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0 mt-0.5" />
      }
      <div className="min-w-0">
        <span className={cn("text-[11px] font-medium", status === "ok" ? "text-white/75" : "text-red-400")}>
          {label}
        </span>
        <p className="text-[11px] text-white/35 truncate">{detail}</p>
      </div>
    </div>
  );
}
