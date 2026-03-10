"use client";

import { useEffect, useRef } from "react";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat } from "@/lib/contexts/chat-context";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import {
  ArrowUp,
  Layers,
  LayoutDashboard,
  MousePointer,
  FileText,
  Globe,
  Wand2,
  User,
  ShoppingCart,
  BookOpen,
  Settings,
  BarChart2,
  ListChecks,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTemplates } from "@/lib/templates";

const QUICK_ACTIONS = [
  { label: "Button component", icon: MousePointer },
  { label: "Sign-up form", icon: FileText },
  { label: "Dashboard layout", icon: LayoutDashboard },
  { label: "Landing page", icon: Globe },
  { label: "Component library", icon: Layers },
];

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  LayoutDashboard,
  Globe,
  FileText,
  User,
  ShoppingCart,
  BookOpen,
  Settings,
  BarChart2,
  ListChecks,
  Tag,
};

export function ChatInterface() {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { messages, input, setInput, handleInputChange, handleSubmit, status } =
    useChat();
  const { createFile } = useFileSystem();
  const isLoading = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;

  const templates = getTemplates();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages]);

  const handleQuickAction = (label: string) => {
    setInput(label);
    textareaRef.current?.focus();
  };

  /** Populate the virtual FS with template files, then prime the chat input. */
  const handleLoadTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    for (const [path, node] of Object.entries(template.files)) {
      if (node.type === "file" && node.content !== undefined) {
        createFile(path, node.content);
      }
    }

    setInput(
      `I've loaded the "${template.name}" starter. Please review the files and suggest improvements or ask what to build next.`
    );
    textareaRef.current?.focus();
  };

  if (!hasMessages) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 pb-8 overflow-y-auto">
        {/* Heading */}
        <div className="text-center mb-8 select-none">
          <h1 className="text-[2rem] font-semibold text-neutral-100 tracking-tight leading-tight mb-3">
            What do you want to build?
          </h1>
          <p className="text-neutral-500 text-sm">
            Describe a UI and I&apos;ll generate React components instantly.
          </p>
        </div>

        {/* Centered input */}
        <div className="w-full max-w-[480px]">
          <form onSubmit={handleSubmit}>
            <div className="relative rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] focus-within:border-[#3a3a3a] transition-colors shadow-xl shadow-black/40">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Describe a component…"
                disabled={isLoading}
                spellCheck={false}
                rows={3}
                className="w-full bg-transparent text-neutral-200 placeholder:text-neutral-600 text-sm px-4 pt-4 pb-12 resize-none focus:outline-none leading-relaxed"
              />
              {/* Bottom row */}
              <div className="absolute bottom-3 right-3">
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                    input.trim() && !isLoading
                      ? "bg-blue-600 hover:bg-blue-500 text-white"
                      : "bg-[#252525] text-neutral-600 cursor-not-allowed"
                  )}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>

          {/* Quick action chips */}
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {QUICK_ACTIONS.map(({ label, icon: Icon }) => (
              <button
                key={label}
                onClick={() => handleQuickAction(label)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#222] text-neutral-400 hover:text-neutral-200 text-xs transition-all"
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Starter template cards */}
          <div className="mt-7">
            <p className="text-[11px] font-medium text-neutral-600 uppercase tracking-widest text-center mb-3 select-none">
              Or start from a template
            </p>
            <div className="grid grid-cols-4 gap-2">
              {templates.map((template) => {
                const Icon = TEMPLATE_ICONS[template.icon] ?? Wand2;
                return (
                  <button
                    key={template.id}
                    onClick={() => handleLoadTemplate(template.id)}
                    className="group flex flex-col items-start gap-1.5 p-3 rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#1f1f1f] transition-all text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#252525] group-hover:bg-blue-600/20 border border-[#2e2e2e] group-hover:border-blue-500/30 flex items-center justify-center transition-all">
                      <Icon className="h-3.5 w-3.5 text-neutral-400 group-hover:text-blue-400 transition-colors" />
                    </div>
                    <span className="text-xs font-medium text-neutral-300 group-hover:text-neutral-100 transition-colors leading-tight">
                      {template.name}
                    </span>
                    <span className="text-[10px] text-neutral-600 group-hover:text-neutral-500 leading-tight line-clamp-2 transition-colors">
                      {template.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ScrollArea ref={scrollAreaRef} className="flex-1 overflow-hidden">
        <div className="py-4">
          <MessageList
            messages={messages}
            isLoading={status === "streaming"}
          />
        </div>
      </ScrollArea>
      <div className="flex-shrink-0">
        <MessageInput
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
