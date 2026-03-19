"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { FileSystemProvider } from "@/lib/contexts/file-system-context";
import { ChatProvider } from "@/lib/contexts/chat-context";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { FileTree } from "@/components/editor/FileTree";
import { PreviewFrame } from "@/components/preview/PreviewFrame";
import { ExportButton } from "@/components/ExportButton";
import { ShareButton } from "@/components/ShareButton";
import { PublishButton } from "@/components/PublishButton";
import { Sidebar } from "@/components/Sidebar";
import { WelcomeFullScreen } from "@/components/onboarding/WelcomeFullScreen";
import { useChat } from "@/lib/contexts/chat-context";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { forkProject } from "@/actions/fork-project";
import { GitFork, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Message } from "ai";

const CodeEditor = dynamic(
  () => import("@/components/editor/CodeEditor").then((m) => m.CodeEditor),
  {
    loading: () => (
      <div className="h-full flex items-center justify-center bg-[#141414]">
        <p className="text-sm text-neutral-600">Loading editor…</p>
      </div>
    ),
    ssr: false,
  }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MainContentProps {
  user?: {
    id: string;
    email: string;
  } | null;
  project?: {
    id: string;
    name: string;
    messages: unknown[];
    data: Record<string, unknown>;
    isPublic: boolean;
    isOwner: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

// ---------------------------------------------------------------------------
// ForkBanner — shown to non-owner visitors of public projects
// ---------------------------------------------------------------------------

function ForkBanner({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleFork() {
    setLoading(true);
    try {
      const forked = await forkProject(projectId);
      toast.success("Project forked — you can now edit it!");
      router.push(`/${forked.id}`);
    } catch {
      toast.error("Fork failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex-shrink-0 h-10 bg-[#0d1117] border-b border-[#1f1f1f] flex items-center justify-between px-4">
      <p className="text-[11px] text-neutral-500">
        You&apos;re viewing a shared project — read-only
      </p>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-xs"
        onClick={handleFork}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <GitFork className="h-3.5 w-3.5" />
        )}
        Fork &amp; Edit
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppShell — rendered inside both providers so it can consume their contexts.
// ---------------------------------------------------------------------------

function AppShell({ user, project }: MainContentProps) {
  const { messages } = useChat();
  const { getAllFiles } = useFileSystem();
  const [activeView, setActiveView] = useState<"preview" | "code">("preview");

  const hasActivity = messages.length > 0 || getAllFiles().size > 0;
  const isOwner = project?.isOwner ?? true;
  const isReadOnly = !isOwner;

  // ── Welcome full-screen (owner only) ────────────────────────────────────
  if (!hasActivity && !isReadOnly) {
    return <WelcomeFullScreen user={user} />;
  }

  // ── Read-only layout (non-owner visitor) ────────────────────────────────
  if (isReadOnly) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-[#050816] flex flex-col relative">
        <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
          <div className="absolute left-[-8%] top-[-8%] h-[26rem] w-[26rem] rounded-full bg-violet-500/16 blur-[120px] animate-drift" />
          <div className="absolute right-[-5%] top-[8%] h-[24rem] w-[24rem] rounded-full bg-cyan-500/14 blur-[120px] animate-drift-delayed" />
        </div>
        {project && <ForkBanner projectId={project.id} />}
        <div className="flex-1 overflow-hidden flex flex-col relative z-10">
          {/* Top bar */}
          <div className="h-12 border-b border-white/10 px-4 flex items-center justify-between flex-shrink-0 bg-white/[0.03] backdrop-blur-xl">
            <div className="inline-flex rounded-2xl border border-white/10 bg-black/20 p-0.5">
              <button
                onClick={() => setActiveView("preview")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition",
                  activeView === "preview" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"
                )}
              >
                Preview
              </button>
              <button
                onClick={() => setActiveView("code")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition",
                  activeView === "code" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"
                )}
              >
                Code
              </button>
            </div>
            <span className="text-[11px] text-white/35">{project?.name}</span>
          </div>
          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {activeView === "preview" ? (
              <div className="h-full bg-white">
                <PreviewFrame />
              </div>
            ) : (
              <ResizablePanelGroup direction="horizontal" className="h-full">
                <ResizablePanel defaultSize={28} minSize={18} maxSize={45}>
                  <div className="h-full bg-black/20 border-r border-white/10">
                    <FileTree />
                  </div>
                </ResizablePanel>
                <ResizableHandle className="w-px bg-white/10 hover:bg-white/20 transition-colors" />
                <ResizablePanel defaultSize={72}>
                  <div className="h-full">
                    <CodeEditor />
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Three-panel split layout (owner) ────────────────────────────────────
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#050816] flex relative">
      {/* Atmospheric orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute left-[-8%] top-[-8%] h-[26rem] w-[26rem] rounded-full bg-violet-500/16 blur-[120px] animate-drift" />
        <div className="absolute right-[-5%] top-[8%] h-[24rem] w-[24rem] rounded-full bg-cyan-500/14 blur-[120px] animate-drift-delayed" />
        <div className="absolute bottom-[-10%] left-[22%] h-[20rem] w-[20rem] rounded-full bg-fuchsia-500/12 blur-[100px] animate-float-slow" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:80px_80px] opacity-[0.12]" />
      </div>

      {/* Left Sidebar */}
      <div className="relative z-10">
        <Sidebar user={user} projectId={project?.id} />
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-hidden relative z-10">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Chat Panel */}
          <ResizablePanel defaultSize={36} minSize={26} maxSize={52}>
            <div className="h-full flex flex-col bg-black/20 backdrop-blur-2xl border-r border-white/10">
              <ChatInterface />
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-px bg-white/10 hover:bg-white/20 transition-colors data-[resize-handle-state=drag]:bg-violet-500" />

          {/* Preview / Code Panel */}
          <ResizablePanel defaultSize={64}>
            <div className="h-full flex flex-col bg-black/10">
              {/* Panel top bar */}
              <div className="h-12 border-b border-white/10 px-4 flex items-center justify-between flex-shrink-0 bg-white/[0.03] backdrop-blur-xl">
                <div className="inline-flex rounded-2xl border border-white/10 bg-black/20 p-0.5">
                  <button
                    onClick={() => setActiveView("preview")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition",
                      activeView === "preview" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"
                    )}
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => setActiveView("code")}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition",
                      activeView === "code" ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"
                    )}
                  >
                    Code
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {project?.id && (
                    <PublishButton projectId={project.id} />
                  )}
                  {project?.id && (
                    <ShareButton
                      projectId={project.id}
                      isPublic={project.isPublic}
                    />
                  )}
                  <ExportButton projectName={project?.name} />
                </div>
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-hidden">
                {activeView === "preview" ? (
                  <div className="h-full bg-white">
                    <PreviewFrame />
                  </div>
                ) : (
                  <ResizablePanelGroup direction="horizontal" className="h-full">
                    <ResizablePanel defaultSize={28} minSize={18} maxSize={45}>
                      <div className="h-full bg-black/20 border-r border-white/10">
                        <FileTree />
                      </div>
                    </ResizablePanel>

                    <ResizableHandle className="w-px bg-white/10 hover:bg-white/20 transition-colors" />

                    <ResizablePanel defaultSize={72}>
                      <div className="h-full">
                        <CodeEditor />
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MainContent — sets up context providers, delegates rendering to AppShell.
// ---------------------------------------------------------------------------

export function MainContent({ user, project }: MainContentProps) {
  return (
    <FileSystemProvider initialData={project?.data}>
      <ChatProvider
        projectId={project?.id}
        initialMessages={project?.messages as Message[] | undefined}
      >
        <AppShell user={user} project={project} />
      </ChatProvider>
    </FileSystemProvider>
  );
}
