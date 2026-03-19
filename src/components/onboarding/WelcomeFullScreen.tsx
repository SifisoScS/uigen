"use client";

import { useRef, useState } from "react";
import { useChat } from "@/lib/contexts/chat-context";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import { getTemplates } from "@/lib/templates";
import { AuthDialog } from "@/components/auth/AuthDialog";
import {
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
import type { FileNode } from "@/lib/file-system";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  { label: "Button component",  icon: MousePointer },
  { label: "Sign-up form",      icon: FileText },
  { label: "Dashboard layout",  icon: LayoutDashboard },
  { label: "Landing page",      icon: Globe },
  { label: "Component library", icon: Layers },
] as const;

const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  LayoutDashboard, Globe, FileText, User, ShoppingCart,
  BookOpen, Settings, BarChart2, ListChecks, Tag,
};

// Subtle per-template gradient tints
const TEMPLATE_GRADIENTS = [
  "from-violet-500/20 via-indigo-500/10 to-cyan-400/10",
  "from-fuchsia-500/20 via-rose-500/10 to-orange-400/10",
  "from-emerald-500/20 via-teal-500/10 to-cyan-400/10",
  "from-blue-500/20 via-indigo-500/10 to-violet-400/10",
  "from-amber-500/20 via-orange-500/10 to-rose-400/10",
  "from-cyan-500/20 via-sky-500/10 to-violet-400/10",
  "from-rose-500/20 via-pink-500/10 to-fuchsia-400/10",
  "from-lime-500/20 via-emerald-500/10 to-teal-400/10",
  "from-orange-500/20 via-amber-500/10 to-yellow-400/10",
  "from-sky-500/20 via-blue-500/10 to-indigo-400/10",
];

// Spark icon
function SparkIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3 9.8 9.8 3 12l6.8 2.2L12 21l2.2-6.8L21 12l-6.8-2.2L12 3Z" />
      <path d="m18 4 .6 1.4L20 6l-1.4.6L18 8l-.6-1.4L16 6l1.4-.6L18 4Z" />
    </svg>
  );
}

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

  const { input, setInput, handleInputChange, handleSubmit, status } = useChat();
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
    for (const [path, node] of Object.entries(template.files as Record<string, FileNode>)) {
      if (node.type === "file" && node.content !== undefined) {
        createFile(path, node.content);
      }
    }
    setInput(`I've loaded the "${template.name}" starter. Please review the files and suggest improvements or ask what to build next.`);
    textareaRef.current?.focus();
  };

  const openAuth = (mode: "signin" | "signup") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center bg-[#050816] overflow-y-auto px-4 relative">

      {/* ── Atmospheric orbs ─────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-8%] top-[-8%] h-[26rem] w-[26rem] rounded-full bg-violet-500/16 blur-[120px] animate-drift" />
        <div className="absolute right-[-5%] top-[8%] h-[24rem] w-[24rem] rounded-full bg-cyan-500/14 blur-[120px] animate-drift-delayed" />
        <div className="absolute bottom-[-10%] left-[30%] h-[20rem] w-[20rem] rounded-full bg-fuchsia-500/12 blur-[100px] animate-float-slow" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:80px_80px] opacity-[0.12]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent,rgba(5,8,22,0.35)_45%,rgba(5,8,22,0.92)_100%)]" />
      </div>

      {/* ── Auth CTA (top-right) ─────────────────────────────────────────── */}
      {!user && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <button
            onClick={() => openAuth("signin")}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl px-4 py-2 text-xs font-medium text-white/65 transition hover:text-white hover:bg-white/[0.10]"
          >
            <LogIn className="h-3 w-3" />
            Sign in
          </button>
          <button
            onClick={() => openAuth("signup")}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-4 py-2 text-xs font-medium text-white transition hover:opacity-90 shadow-[0_0_24px_rgba(99,102,241,0.3)]"
          >
            <UserPlus className="h-3 w-3" />
            Get started
          </button>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative flex flex-col items-center justify-center w-full pt-[12vh] pb-10 z-10">

        {/* Brand pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.36em] text-white/55 backdrop-blur-xl mb-8">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Interface synthesis engine
        </div>

        {/* Brand icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-[22px] bg-gradient-to-br from-violet-500 to-cyan-400 mb-6 shadow-[0_0_55px_rgba(99,102,241,0.4)] select-none">
          <SparkIcon className="h-8 w-8 text-white" />
        </div>

        {/* Heading */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold text-white tracking-tight leading-tight mb-4 text-center select-none text-balance">
          Design the UI that the AI era deserves.
        </h1>
        <p className="text-white/55 text-base sm:text-lg max-w-2xl mx-auto leading-8 text-center mb-10 select-none text-pretty">
          Prompt once, sculpt inside a living workspace where chat, preview, and code breathe in the same frame — powered by Claude.
        </p>

        {/* ── Main input ─────────────────────────────────────────────────── */}
        <div className="w-full max-w-3xl">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.05] p-3 shadow-2xl shadow-black/40 backdrop-blur-2xl">
            <form onSubmit={handleSubmit}>
              <div className="rounded-[28px] border border-white/10 bg-black/20 p-4 sm:p-5">
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
                  rows={4}
                  aria-label="Describe what you want to build"
                  className="w-full resize-none bg-transparent text-white placeholder:text-white/28 text-base leading-8 outline-none"
                />

                <div className="mt-4 flex flex-col gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-end sm:justify-between">
                  {/* Quick action chips */}
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Quick suggestions">
                    {QUICK_ACTIONS.map(({ label, icon: Icon }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleQuickAction(label)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/65 transition hover:bg-white/10 hover:text-white/85"
                      >
                        <Icon className="h-3 w-3" aria-hidden />
                        {label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    aria-label="Submit prompt"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-cyan-400 px-5 py-3 text-sm font-medium text-white shadow-[0_0_32px_rgba(99,102,241,0.3)] transition hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    Generate spatial blueprint
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ── Template grid ────────────────────────────────────────────────── */}
      <div className="relative w-full max-w-6xl pb-20 z-10">
        <div className="mb-6 text-center">
          <p className="text-[11px] font-medium text-white/35 uppercase tracking-[0.36em] mb-3">
            Start from a living template
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold text-white">
            Blueprints that feel closer to products than mockups.
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-8">
          {templates.map((template, index) => {
            const Icon = TEMPLATE_ICONS[template.icon] ?? Wand2;
            const gradient = TEMPLATE_GRADIENTS[index % TEMPLATE_GRADIENTS.length];
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => handleLoadTemplate(template.id)}
                aria-label={`Load ${template.name} template`}
                className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] text-left transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050816]"
              >
                <div className={`absolute inset-0 bg-gradient-to-br opacity-90 ${gradient}`} />
                <div className="absolute inset-px rounded-[27px] bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.1),transparent_45%),linear-gradient(180deg,rgba(2,6,23,0.05),rgba(2,6,23,0.7))]" />

                {/* Icon area */}
                <div className="relative aspect-video flex items-center justify-center border-b border-white/10">
                  <div className="w-14 h-14 rounded-2xl border border-white/10 bg-black/20 flex items-center justify-center group-hover:bg-white/5 transition">
                    <Icon className="h-7 w-7 text-white/60 group-hover:text-white transition" aria-hidden />
                  </div>
                </div>

                {/* Text */}
                <div className="relative p-4">
                  <p className="text-sm font-semibold text-white group-hover:text-white transition mb-1 leading-snug">
                    {template.name}
                  </p>
                  <p className="text-xs text-white/45 group-hover:text-white/60 transition line-clamp-2 leading-relaxed">
                    {template.description}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs text-white/35">
                    <span>Open blueprint</span>
                    <span className="translate-x-0 transition group-hover:translate-x-1">↗</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Auth nudge */}
        {!user && (
          <p className="mt-10 text-xs text-white/30 text-center">
            <button
              onClick={() => openAuth("signin")}
              className="underline underline-offset-2 hover:text-white/55 transition"
            >
              Sign in
            </button>
            {" or "}
            <button
              onClick={() => openAuth("signup")}
              className="underline underline-offset-2 hover:text-white/55 transition"
            >
              create an account
            </button>
            {" to save your designs across sessions."}
          </p>
        )}
      </div>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} defaultMode={authMode} />
    </div>
  );
}
