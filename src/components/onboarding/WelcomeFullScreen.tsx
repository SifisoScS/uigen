"use client";

import { useRef, useState } from "react";
import { useChat } from "@/lib/contexts/chat-context";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { getTemplates } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { AuthDialog } from "@/components/auth/AuthDialog";
import {
  Sparkles,
  ArrowUp,
  MousePointer,
  FileText,
  LayoutDashboard,
  Globe,
  Layers,
  Wand2,
  User,
  ShoppingCart,
  BookOpen,
  Settings,
  BarChart2,
  ListChecks,
  Tag,
  LogIn,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileNode } from "@/lib/file-system";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  { label: "Button component", icon: MousePointer },
  { label: "Sign-up form", icon: FileText },
  { label: "Dashboard layout", icon: LayoutDashboard },
  { label: "Landing page", icon: Globe },
  { label: "Component library", icon: Layers },
] as const;

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WelcomeFullScreenProps {
  user?: { id: string; email: string } | null;
}

export function WelcomeFullScreen({ user }: WelcomeFullScreenProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  const { input, setInput, handleInputChange, handleSubmit, status } =
    useChat();
  const { createFile } = useFileSystem();

  const isLoading = status === "submitted" || status === "streaming";
  const templates = getTemplates();

  const handleQuickAction = (label: string) => {
    setInput(label);
    textareaRef.current?.focus();
  };

  const handleLoadTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    for (const [path, node] of Object.entries(
      template.files as Record<string, FileNode>
    )) {
      if (node.type === "file" && node.content !== undefined) {
        createFile(path, node.content);
      }
    }

    setInput(
      `I've loaded the "${template.name}" starter. Please review the files and suggest improvements or ask what to build next.`
    );
    textareaRef.current?.focus();
  };

  const openAuth = (mode: "signin" | "signup") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center bg-[#0f0f0f] overflow-y-auto px-4 relative">
      {/* ── Top-right auth CTA — immediately visible without scrolling ─────── */}
      {!user && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openAuth("signin")}
            className="h-8 px-3 text-xs border-[#2a2a2a] bg-[#141414]/80 backdrop-blur text-neutral-400 hover:text-neutral-200 hover:bg-[#1e1e1e] hover:border-[#3a3a3a] gap-1.5"
          >
            <LogIn className="h-3 w-3" aria-hidden />
            Sign in
          </Button>
          <Button
            size="sm"
            onClick={() => openAuth("signup")}
            className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-500 text-white gap-1.5"
          >
            <UserPlus className="h-3 w-3" aria-hidden />
            Get started
          </Button>
        </div>
      )}

      {/* Hero + Input — vertically centered in the viewport on load */}
      <div className="flex flex-col items-center justify-center w-full pt-[12vh] pb-10">
        {/* Brand icon */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 mb-6 select-none">
          <Sparkles className="h-7 w-7 text-blue-400" aria-hidden />
        </div>

        {/* Heading */}
        <h1 className="text-4xl sm:text-5xl font-bold text-neutral-100 tracking-tight leading-tight mb-4 text-center select-none">
          Welcome to UIGen
        </h1>
        <p className="text-neutral-500 text-base sm:text-lg max-w-md mx-auto leading-relaxed text-center mb-10 select-none">
          Describe any UI and get instant React components — powered by Claude.
        </p>

        {/* ------------------------------------------------------------------ */}
        {/* Main input                                                          */}
        {/* ------------------------------------------------------------------ */}
        <div className="w-full max-w-2xl">
          <form onSubmit={handleSubmit}>
            <div className="relative rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] focus-within:border-[#3a3a3a] transition-colors shadow-2xl shadow-black/60">
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
                placeholder="Describe a component, layout, or full page…"
                disabled={isLoading}
                spellCheck={false}
                rows={3}
                aria-label="Describe what you want to build"
                className="w-full bg-transparent text-neutral-200 placeholder:text-neutral-600 text-sm sm:text-base px-5 pt-5 pb-14 resize-none focus:outline-none leading-relaxed"
              />
              <div className="absolute bottom-4 right-4 flex items-center gap-2">
                <span className="text-[11px] text-neutral-700 select-none hidden sm:inline">
                  ↵ to submit
                </span>
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  aria-label="Submit prompt"
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center transition-all",
                    input.trim() && !isLoading
                      ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40"
                      : "bg-[#252525] text-neutral-600 cursor-not-allowed"
                  )}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </form>

          {/* Quick-action suggestion chips */}
          <div
            className="flex flex-wrap gap-2 mt-5 justify-center"
            role="group"
            aria-label="Quick suggestions"
          >
            {QUICK_ACTIONS.map(({ label, icon: Icon }) => (
              <Button
                key={label}
                type="button"
                variant="outline"
                onClick={() => handleQuickAction(label)}
                className="rounded-full h-8 px-4 text-xs border-[#2a2a2a] bg-[#1a1a1a] text-neutral-400 hover:text-neutral-200 hover:bg-[#222] hover:border-[#3a3a3a] gap-1.5"
              >
                <Icon className="h-3 w-3" aria-hidden />
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Template grid                                                         */}
      {/* -------------------------------------------------------------------- */}
      <div className="w-full max-w-6xl pb-20">
        <p className="text-[11px] font-semibold text-neutral-600 uppercase tracking-widest text-center mb-5 select-none">
          Or start from a template
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {templates.map((template) => {
            const Icon = TEMPLATE_ICONS[template.icon] ?? Wand2;
            return (
              <div
                key={template.id}
                onClick={() => handleLoadTemplate(template.id)}
                tabIndex={0}
                role="button"
                aria-label={`Load ${template.name} template`}
                onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleLoadTemplate(template.id);
                  }
                }}
                className="group cursor-pointer rounded-xl bg-[#141414] border border-[#1f1f1f] hover:border-[#2a2a2a] hover:shadow-lg hover:shadow-black/50 hover:scale-[1.02] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f0f0f] overflow-hidden"
              >
                  {/* Icon placeholder in aspect-video ratio */}
                  <div className="aspect-video bg-[#1a1a1a] flex items-center justify-center border-b border-[#1f1f1f] group-hover:bg-[#1e1e1e] transition-colors">
                    <div className="w-12 h-12 rounded-2xl bg-[#252525] group-hover:bg-blue-600/20 border border-[#2e2e2e] group-hover:border-blue-500/30 flex items-center justify-center transition-all duration-200">
                      <Icon
                        className="h-6 w-6 text-neutral-400 group-hover:text-blue-400 transition-colors"
                        aria-hidden
                      />
                    </div>
                  </div>

                  {/* Text content */}
                  <div className="p-4">
                    <p className="text-sm font-semibold text-neutral-200 group-hover:text-white transition-colors mb-1 leading-snug">
                      {template.name}
                    </p>
                    <p className="text-xs text-neutral-600 group-hover:text-neutral-500 transition-colors line-clamp-2 leading-relaxed">
                      {template.description}
                    </p>
                  </div>
              </div>
            );
          })}
        </div>

        {/* Auth nudge at the bottom — subtle reminder after scrolling templates */}
        {!user && (
          <p className="mt-10 text-xs text-neutral-700 text-center">
            <button
              onClick={() => openAuth("signin")}
              className="underline underline-offset-2 hover:text-neutral-500 transition-colors"
            >
              Sign in
            </button>
            {" or "}
            <button
              onClick={() => openAuth("signup")}
              className="underline underline-offset-2 hover:text-neutral-500 transition-colors"
            >
              create an account
            </button>
            {" to save your designs across sessions."}
          </p>
        )}
      </div>

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultMode={authMode}
      />
    </div>
  );
}
