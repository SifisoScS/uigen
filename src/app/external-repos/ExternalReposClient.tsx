"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Plus, Zap, CheckCircle, XCircle, Loader2, Server, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerExternalRepo } from "@/actions/register-external-repo";
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
  const [repos, setRepos] = useState<Repo[]>(initialRepos);

  // ── Register form state ──────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerResult, setRegisterResult] = useState<RegisterResult | null>(null);
  const [isRegistering, startRegister] = useTransition();

  // ── Build state ──────────────────────────────────────────────────────────────
  const [buildRepoId, setBuildRepoId] = useState<string | null>(null);
  const [artifactId, setArtifactId] = useState("");
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

  const handleBuild = (repoId: string) => {
    setBuildError((e) => ({ ...e, [repoId]: null }));
    setBuildResult((r) => ({ ...r, [repoId]: null }));
    startBuild(async () => {
      try {
        const result = await requestDistributedBuild(repoId, artifactId.trim() || `mesh:art-${Date.now()}`);
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
    <div className="space-y-10">

      {/* ── Register form ─────────────────────────────────────────────────── */}
      <section className="bg-white border border-neutral-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Plus className="h-4 w-4 text-neutral-500" />
          <h2 className="text-sm font-semibold text-neutral-800">Register Sifiso OS Node</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="repo-name" className="text-xs text-neutral-600">Name</Label>
            <Input
              id="repo-name"
              placeholder="Sifiso OS (Local)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repo-url" className="text-xs text-neutral-600">Node URL</Label>
            <Input
              id="repo-url"
              placeholder="http://localhost:8000"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="repo-apikey" className="text-xs text-neutral-600">
              API Key <span className="text-neutral-400">(optional)</span>
            </Label>
            <Input
              id="repo-apikey"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="h-8 text-sm font-mono"
              type="password"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button
            size="sm"
            onClick={handleRegister}
            disabled={isRegistering || !name.trim() || !url.trim()}
            className="gap-2"
          >
            {isRegistering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
            {isRegistering ? "Handshaking…" : "Register & Handshake"}
          </Button>

          {registerResult && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle className="h-3.5 w-3.5" />
              {registerResult.alreadyExisted ? "Already registered" : "Registered successfully"}
            </span>
          )}
          {registerError && (
            <span className="flex items-center gap-1.5 text-xs text-red-500">
              <XCircle className="h-3.5 w-3.5" />
              {registerError}
            </span>
          )}
        </div>

        <p className="mt-3 text-[11px] text-neutral-400">
          UIGen will POST to <code className="bg-neutral-100 px-1 rounded">/mesh/handshake</code> on the target node
          using its Ed25519 identity (§22.4). The remote node DID and public key are stored for signature verification.
        </p>
      </section>

      {/* ── Registered nodes ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-neutral-700 mb-3">
          Registered Nodes ({repos.length})
        </h2>

        {repos.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-neutral-200 rounded-xl text-neutral-400">
            <Server className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No nodes registered yet</p>
            <p className="text-xs mt-1">Register a Sifiso OS node above to begin.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {repos.map((repo) => (
              <div key={repo.id} className="bg-white border border-neutral-200 rounded-xl p-5">

                {/* Node header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-neutral-900">{repo.name}</span>
                      {repo.nodeId ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle className="h-2.5 w-2.5" /> Handshaked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          <XCircle className="h-2.5 w-2.5" /> No handshake
                        </span>
                      )}
                    </div>
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-neutral-500 hover:text-blue-500 transition-colors mt-0.5 inline-block"
                    >
                      {repo.url}
                    </a>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-shrink-0 gap-1.5 text-xs h-7"
                    onClick={() => setBuildRepoId(buildRepoId === repo.id ? null : repo.id)}
                    disabled={isBuilding}
                  >
                    <Zap className="h-3 w-3" />
                    Distributed Build
                  </Button>
                </div>

                {/* Node identity */}
                {repo.nodeId && (
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <Server className="h-3 w-3 text-neutral-400 flex-shrink-0" />
                      <code className="text-[11px] text-neutral-500 truncate">{repo.nodeId}</code>
                    </div>
                    {repo.publicKey && (
                      <div className="flex items-center gap-2">
                        <Key className="h-3 w-3 text-neutral-400 flex-shrink-0" />
                        <code className="text-[11px] text-neutral-500 truncate">{repo.publicKey.slice(0, 32)}…</code>
                      </div>
                    )}
                  </div>
                )}

                {/* Distributed Build panel */}
                {buildRepoId === repo.id && (
                  <div className="mt-4 pt-4 border-t border-neutral-100">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Artifact ID (e.g. mesh:art-001) — leave blank to auto-generate"
                        value={artifactId}
                        onChange={(e) => setArtifactId(e.target.value)}
                        className="h-7 text-xs font-mono"
                      />
                      <Button
                        size="sm"
                        className="gap-1.5 h-7 text-xs flex-shrink-0"
                        onClick={() => handleBuild(repo.id)}
                        disabled={isBuilding}
                      >
                        {isBuilding
                          ? <><Loader2 className="h-3 w-3 animate-spin" /> Running…</>
                          : <><Zap className="h-3 w-3" /> Run</>
                        }
                      </Button>
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-1.5">
                      Runs the full 8-step Mesh loop: orchestrate → propose → vote → critique → assign → forge (§18–§21)
                    </p>
                  </div>
                )}

                {/* Build result */}
                {buildResult[repo.id] && (
                  <BuildResultPanel result={buildResult[repo.id]!} />
                )}
                {buildError[repo.id] && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
                    {buildError[repo.id]}
                  </div>
                )}
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
    <div className="mt-4 pt-4 border-t border-neutral-100 space-y-3">
      <p className="text-[11px] font-semibold text-neutral-600 uppercase tracking-wide">Build Result</p>

      {/* Orchestration */}
      {result.orchestration && (
        <ResultRow
          label="Orchestration"
          status="ok"
          detail={`${result.orchestration.candidate_nodes.length} candidate(s): ${result.orchestration.candidate_nodes[0]?.slice(0, 32)}…`}
        />
      )}

      {/* Proposal */}
      <ResultRow
        label="Proposal"
        status="ok"
        detail={`ID: ${result.proposal.proposal_id}`}
      />

      {/* Vote */}
      <ResultRow
        label="Quorum Vote"
        status={result.vote.vote === "approve" ? "ok" : "fail"}
        detail={[
          result.vote.vote,
          result.vote.quorum_votes != null ? `${result.vote.quorum_votes} vote(s)` : null,
          result.vote.quorum_passed != null ? (result.vote.quorum_passed ? "quorum passed" : "quorum failed") : null,
        ].filter(Boolean).join(" · ")}
      />

      {/* Task */}
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
    <div className="flex items-start gap-2">
      {status === "ok"
        ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
        : <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
      }
      <div className="min-w-0">
        <span className={cn("text-[11px] font-medium", status === "ok" ? "text-neutral-700" : "text-red-600")}>
          {label}
        </span>
        <p className="text-[11px] text-neutral-400 truncate">{detail}</p>
      </div>
    </div>
  );
}
