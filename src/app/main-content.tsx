"use client";

import { useState } from "react";
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
import { Sidebar } from "@/components/Sidebar";

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
    createdAt: Date;
    updatedAt: Date;
  };
}

export function MainContent({ user, project }: MainContentProps) {
  const [activeView, setActiveView] = useState<"preview" | "code">("preview");

  return (
    <FileSystemProvider initialData={project?.data}>
      <ChatProvider
        projectId={project?.id}
        initialMessages={
          project?.messages as import("ai").Message[] | undefined
        }
      >
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
                      onValueChange={(v) =>
                        setActiveView(v as "preview" | "code")
                      }
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

                    {project?.id && (
                      <ExportButton projectName={project.name} />
                    )}
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
      </ChatProvider>
    </FileSystemProvider>
  );
}
