"use client";

import { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  input: string;
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
}

export function MessageInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
}: MessageInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="px-4 py-3 border-t border-[#1f1f1f] bg-[#111111]"
    >
      <div className="relative rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] focus-within:border-[#3a3a3a] transition-colors">
        <textarea
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Describe changes or a new component…"
          disabled={isLoading}
          spellCheck={false}
          rows={2}
          className="w-full bg-transparent text-neutral-200 placeholder:text-neutral-600 text-sm px-4 pt-3 pb-10 resize-none focus:outline-none leading-relaxed"
        />
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-2">
          {isLoading && (
            <Loader2 className="h-3.5 w-3.5 text-neutral-600 animate-spin" />
          )}
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center transition-all",
              input.trim() && !isLoading
                ? "bg-blue-600 hover:bg-blue-500 text-white"
                : "bg-[#252525] text-neutral-600 cursor-not-allowed"
            )}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="text-[10px] text-neutral-700 mt-1.5 text-center">
        Enter to send · Shift+Enter for new line
      </p>
    </form>
  );
}
