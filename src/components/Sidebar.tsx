"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, LogOut, LogIn, History, Layers, Network, Shield,
  Package, Server, ChevronRight,
} from "lucide-react";
import { GovernanceLog } from "@/components/GovernanceLog";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { SnapshotTimeline } from "@/components/SnapshotTimeline";
import { VersionGraph } from "@/components/VersionGraph";
import { signOut } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { useChat } from "@/lib/contexts/chat-context";
import { cn } from "@/lib/utils";

interface SidebarProps {
  user?: { id: string; email: string } | null;
  projectId?: string;
}

interface Project {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

type SidebarView = "projects" | "history" | "governance";

// Spark icon — matches Nova brand mark
function SparkIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3 9.8 9.8 3 12l6.8 2.2L12 21l2.2-6.8L21 12l-6.8-2.2L12 3Z" />
      <path d="m18 4 .6 1.4L20 6l-1.4.6L18 8l-.6-1.4L16 6l1.4-.6L18 4Z" />
    </svg>
  );
}

export function Sidebar({ user, projectId }: SidebarProps) {
  const router = useRouter();
  const { generationCount } = useChat();
  const [view, setView] = useState<SidebarView>("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [graphOpen, setGraphOpen] = useState(false);

  useEffect(() => {
    if (user) {
      getProjects().then(setProjects).catch(console.error);
    }
  }, [user]);

  const handleNewDesign = async () => {
    const project = await createProject({
      name: `Design #${~~(Math.random() * 100000)}`,
      messages: [],
      data: {},
    });
    router.push(`/${project.id}`);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const canShowHistory = !!projectId && !!user;

  return (
    <div className="w-[260px] flex-shrink-0 h-full flex flex-col bg-black/30 backdrop-blur-2xl border-r border-white/10">

      {/* ── Brand header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between rounded-[22px] border border-white/10 bg-white/[0.04] mx-3 mt-3 px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-[0_0_28px_rgba(99,102,241,0.35)]">
            <SparkIcon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">UIGen</p>
            <p className="text-[10px] text-white/40 leading-none mt-0.5">Nova workspace</p>
          </div>
        </div>
      </div>

      {/* ── New Design ────────────────────────────────────────────────────── */}
      <div className="px-3 mt-3">
        <button
          onClick={handleNewDesign}
          className="w-full flex items-center justify-center gap-2 rounded-[18px] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-medium text-white/80 transition hover:bg-white/[0.08] hover:text-white"
        >
          <span className="text-lg leading-none">+</span>
          New design
        </button>
      </div>

      {/* ── View toggle ───────────────────────────────────────────────────── */}
      {canShowHistory && (
        <div className="px-3 mt-3">
          <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-1">
            <div className="grid grid-cols-3 gap-1 text-[11px]">
              {([
                { id: "projects", label: "Projects", icon: <Layers className="h-3 w-3" /> },
                { id: "history",  label: "History",  icon: <History className="h-3 w-3" /> },
                { id: "governance", label: "Gov",    icon: <Shield className="h-3 w-3" /> },
              ] as { id: SidebarView; label: string; icon: React.ReactNode }[]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setView(tab.id)}
                  className={cn(
                    "flex items-center justify-center gap-1 rounded-2xl px-2 py-1.5 transition font-medium",
                    view === tab.id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0 mt-4 px-3">
        {view === "governance" && canShowHistory && projectId ? (
          <>
            <p className="text-[10px] text-white/35 uppercase tracking-[0.28em] font-medium mb-2 px-1">
              Governance Log
            </p>
            <GovernanceLog projectId={projectId} />
          </>
        ) : view === "history" && canShowHistory ? (
          <>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-[10px] text-white/35 uppercase tracking-[0.28em] font-medium">
                Checkpoints
              </p>
              <button
                onClick={() => setGraphOpen(true)}
                className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/5 transition"
                title="Version Graph"
              >
                <Network className="h-3.5 w-3.5" />
              </button>
            </div>
            <SnapshotTimeline projectId={projectId} generationCount={generationCount} />
          </>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">
            {user && projects.length > 0 && (
              <>
                <p className="text-[10px] text-white/35 uppercase tracking-[0.28em] font-medium mb-3 px-1">
                  All designs
                </p>
                <div className="space-y-1">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => router.push(`/${p.id}`)}
                      className={cn(
                        "w-full rounded-[18px] border px-3 py-2.5 text-left transition",
                        p.id === projectId
                          ? "border-white/15 bg-white/10"
                          : "border-white/0 bg-transparent hover:border-white/10 hover:bg-white/5"
                      )}
                    >
                      <p className="text-sm font-medium text-white/85 truncate">{p.name}</p>
                      <p className="mt-0.5 text-[10px] leading-5 text-white/35 truncate">
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </p>
                    </button>
                  ))}
                </div>
              </>
            )}
            {!user && (
              <p className="text-[11px] text-white/35 leading-relaxed px-1">
                Sign in to save and revisit your designs.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom nav ────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 pt-3 space-y-1 border-t border-white/10 mt-3">
        {[
          { label: "Registry",   icon: <Package className="h-3.5 w-3.5" />,  href: "/registry" },
          { label: "Mesh Nodes", icon: <Server className="h-3.5 w-3.5" />,   href: "/external-repos" },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => router.push(item.href)}
            className="flex w-full items-center gap-2.5 rounded-2xl border border-transparent px-3 py-2.5 text-sm text-white/50 transition hover:border-white/10 hover:bg-white/5 hover:text-white/80"
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Auth footer ───────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 mx-3 mb-3 mt-2">
        {user ? (
          <div className="rounded-[22px] border border-white/10 bg-white/[0.05] p-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-rose-400 text-white flex-shrink-0">
                <span className="text-sm font-semibold">{user.email[0].toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white/85">{user.email}</p>
                <p className="text-[10px] text-white/40">Sovereign account · online</p>
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 rounded-xl text-white/35 hover:text-white/70 hover:bg-white/5 transition flex-shrink-0"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-[22px] border border-white/10 bg-white/[0.05] p-3 space-y-2">
            <button
              onClick={() => { setAuthMode("signin"); setAuthDialogOpen(true); }}
              className="w-full flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60 transition hover:text-white/85 hover:bg-white/8"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign in
            </button>
            <button
              onClick={() => { setAuthMode("signup"); setAuthDialogOpen(true); }}
              className="w-full flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Create account
              <ChevronRight className="h-3.5 w-3.5 ml-auto" />
            </button>
          </div>
        )}
      </div>

      <AuthDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        defaultMode={authMode}
      />

      {graphOpen && projectId && (
        <VersionGraph
          projectId={projectId}
          generationCount={generationCount}
          onClose={() => setGraphOpen(false)}
        />
      )}
    </div>
  );
}
