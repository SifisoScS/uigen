"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, LogOut, LogIn, Sparkles,
  PanelLeftClose, PanelLeftOpen, History, Layers, Network,
} from "lucide-react";
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

type SidebarView = "projects" | "history";

export function Sidebar({ user, projectId }: SidebarProps) {
  const router = useRouter();
  const { generationCount } = useChat();
  const [collapsed, setCollapsed] = useState(false);
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

  // History tab only available when viewing an owned project
  const canShowHistory = !!projectId && !!user;

  if (collapsed) {
    return (
      <div className="w-12 flex-shrink-0 h-full flex flex-col items-center py-3 gap-3 bg-[#111111] border-r border-[#1f1f1f]">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 rounded-md text-neutral-600 hover:text-neutral-300 hover:bg-[#1e1e1e] transition-colors"
          title="Expand sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <button
          onClick={handleNewDesign}
          className="p-1.5 rounded-md text-neutral-600 hover:text-neutral-300 hover:bg-[#1e1e1e] transition-colors"
          title="New Design"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-[220px] flex-shrink-0 h-full flex flex-col bg-[#111111] border-r border-[#1f1f1f]">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-neutral-100 font-semibold text-sm tracking-tight">UIGen</span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 rounded-md text-neutral-600 hover:text-neutral-400 hover:bg-[#1e1e1e] transition-colors"
          title="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* New Design */}
      <div className="px-3 mb-3 flex-shrink-0">
        <button
          onClick={handleNewDesign}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#1a1a1a] hover:bg-[#222222] text-neutral-300 hover:text-neutral-100 text-sm font-medium transition-colors border border-[#2a2a2a] hover:border-[#333]"
        >
          <Plus className="h-4 w-4" />
          New Design
        </button>
      </div>

      {/* Projects / History toggle tabs */}
      {canShowHistory && (
        <div className="px-3 mb-2 flex-shrink-0">
          <div className="flex bg-[#1a1a1a] rounded-md p-0.5 border border-[#252525]">
            <button
              onClick={() => setView("projects")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1 rounded text-[11px] font-medium transition-colors",
                view === "projects"
                  ? "bg-[#2a2a2a] text-neutral-200"
                  : "text-neutral-600 hover:text-neutral-400"
              )}
            >
              <Layers className="h-3 w-3" />
              Projects
            </button>
            <button
              onClick={() => setView("history")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1 rounded text-[11px] font-medium transition-colors",
                view === "history"
                  ? "bg-[#2a2a2a] text-neutral-200"
                  : "text-neutral-600 hover:text-neutral-400"
              )}
            >
              <History className="h-3 w-3" />
              History
            </button>
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {view === "history" && canShowHistory ? (
          <>
            <div className="px-3 mb-1 flex-shrink-0 flex items-center justify-between">
              <p className="text-[10px] text-neutral-600 uppercase tracking-wider font-medium">
                Checkpoints
              </p>
              <button
                onClick={() => setGraphOpen(true)}
                className="p-1 rounded text-neutral-700 hover:text-neutral-400 hover:bg-[#1e1e1e] transition-colors"
                title="Version Graph"
              >
                <Network className="h-3.5 w-3.5" />
              </button>
            </div>
            <SnapshotTimeline
              projectId={projectId}
              generationCount={generationCount}
            />
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-3 min-h-0">
            {user && projects.length > 0 && (
              <>
                <div className="text-[11px] font-medium text-neutral-600 uppercase tracking-wider mb-2 px-1">
                  All designs
                </div>
                <div className="space-y-0.5">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => router.push(`/${p.id}`)}
                      className={cn(
                        "w-full text-left px-2.5 py-2 rounded-md text-xs truncate transition-colors",
                        p.id === projectId
                          ? "bg-[#1e1e1e] text-neutral-200 border border-[#2e2e2e]"
                          : "text-neutral-500 hover:text-neutral-300 hover:bg-[#181818]"
                      )}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            {!user && (
              <div className="px-1">
                <p className="text-[11px] text-neutral-700 leading-relaxed">
                  Sign in to save and revisit your designs.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Auth footer */}
      <div className="flex-shrink-0 px-3 py-3 border-t border-[#1f1f1f]">
        {user ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] text-blue-400 font-semibold">
                {user.email[0].toUpperCase()}
              </span>
            </div>
            <span className="flex-1 text-xs text-neutral-500 truncate">{user.email}</span>
            <button
              onClick={handleSignOut}
              className="p-1 rounded-md text-neutral-600 hover:text-neutral-300 hover:bg-[#1e1e1e] transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <button
              onClick={() => { setAuthMode("signin"); setAuthDialogOpen(true); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-neutral-500 hover:text-neutral-300 hover:bg-[#1a1a1a] transition-colors"
            >
              <LogIn className="h-3.5 w-3.5" />
              Sign in
            </button>
            <button
              onClick={() => { setAuthMode("signup"); setAuthDialogOpen(true); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Create account
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
