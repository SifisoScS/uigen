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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportButton } from "@/components/ExportButton";
import { ShareButton } from "@/components/ShareButton";
import { Sidebar } from "@/components/Sidebar";
import { WelcomeFullScreen } from "@/components/onboarding/WelcomeFullScreen";
import { useChat } from "@/lib/contexts/chat-context";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { forkProject } from "@/actions/fork-project";
import { GitFork, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
      <div className="h-screen w-screen overflow-hidden bg-[#0f0f0f] flex flex-col">
        {project && <ForkBanner projectId={project.id} />}
        <div className="flex-1 overflow-hidden flex flex-col bg-[#141414]">
          {/* Top bar */}
          <div className="h-12 border-b border-[#1f1f1f] px-4 flex items-center justify-between flex-shrink-0">
            <Tabs
              value={activeView}
              onValueChange={(v) => setActiveView(v as "preview" | "code")}
            >
              <TabsList className="bg-[#1a1a1a] border border-[#2a2a2a] p-0.5 h-8 gap-0.5">
                <TabsTrigger
                  value="preview"
                  className="data-[state=active]:bg-[#252525] data-[state=active]:text-neutral-100 data-[state=active]:shadow-none text-neutral-500 px-3 py-1 text-xs font-medium transition-all h-7"
                >
                  Preview
                </TabsTrigger>
                <TabsTrigger
                  value="code"
                  className="data-[state=active]:bg-[#252525] data-[state=active]:text-neutral-100 data-[state=active]:shadow-none text-neutral-500 px-3 py-1 text-xs font-medium transition-all h-7"
                >
                  Code
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-[11px] text-neutral-600">{project?.name}</span>
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
                  <div className="h-full bg-[#111111] border-r border-[#1f1f1f]">
                    <FileTree />
                  </div>
                </ResizablePanel>
                <ResizableHandle className="w-px bg-[#1f1f1f] hover:bg-[#333] transition-colors" />
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
    <div className="h-screen w-screen overflow-hidden bg-[#0f0f0f] flex">
      {/* Left Sidebar */}
      <Sidebar user={user} projectId={project?.id} />

      {/* Main Area */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Chat Panel */}
          <ResizablePanel defaultSize={36} minSize={26} maxSize={52}>
            <div className="h-full flex flex-col bg-[#111111]">
              <ChatInterface />
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-px bg-[#1f1f1f] hover:bg-[#333] transition-colors data-[resize-handle-state=drag]:bg-blue-600" />

          {/* Preview / Code Panel */}
          <ResizablePanel defaultSize={64}>
            <div className="h-full flex flex-col bg-[#141414]">
              {/* Panel top bar */}
              <div className="h-12 border-b border-[#1f1f1f] px-4 flex items-center justify-between flex-shrink-0">
                <Tabs
                  value={activeView}
                  onValueChange={(v) => setActiveView(v as "preview" | "code")}
                >
                  <TabsList className="bg-[#1a1a1a] border border-[#2a2a2a] p-0.5 h-8 gap-0.5">
                    <TabsTrigger
                      value="preview"
                      className="data-[state=active]:bg-[#252525] data-[state=active]:text-neutral-100 data-[state=active]:shadow-none text-neutral-500 px-3 py-1 text-xs font-medium transition-all h-7"
                    >
                      Preview
                    </TabsTrigger>
                    <TabsTrigger
                      value="code"
                      className="data-[state=active]:bg-[#252525] data-[state=active]:text-neutral-100 data-[state=active]:shadow-none text-neutral-500 px-3 py-1 text-xs font-medium transition-all h-7"
                    >
                      Code
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <div className="flex items-center gap-2">
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
                  <ResizablePanelGroup
                    direction="horizontal"
                    className="h-full"
                  >
                    <ResizablePanel
                      defaultSize={28}
                      minSize={18}
                      maxSize={45}
                    >
                      <div className="h-full bg-[#111111] border-r border-[#1f1f1f]">
                        <FileTree />
                      </div>
                    </ResizablePanel>

                    <ResizableHandle className="w-px bg-[#1f1f1f] hover:bg-[#333] transition-colors" />

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
