"use client";

import { Message } from "ai";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  return (
    <div className="px-4 space-y-5">
      {messages.map((message) => (
        <div
          key={message.id || message.content}
          className={cn(
            "flex gap-3",
            message.role === "user" ? "justify-end" : "justify-start"
          )}
        >
          {/* Assistant avatar */}
          {message.role === "assistant" && (
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-600/30 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-blue-400" />
              </div>
            </div>
          )}

          <div
            className={cn(
              "flex flex-col gap-1.5 max-w-[85%]",
              message.role === "user" ? "items-end" : "items-start"
            )}
          >
            <div
              className={cn(
                "rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                message.role === "user"
                  ? "bg-[#1e2d47] text-blue-100 border border-blue-800/40"
                  : "bg-[#1a1a1a] text-neutral-300 border border-[#2a2a2a]"
              )}
            >
              {message.parts ? (
                <>
                  {message.parts.map((part, partIndex) => {
                    switch (part.type) {
                      case "text":
                        return message.role === "user" ? (
                          <span key={partIndex} className="whitespace-pre-wrap">
                            {part.text}
                          </span>
                        ) : (
                          <MarkdownRenderer
                            key={partIndex}
                            content={part.text}
                            className="prose-sm prose-invert"
                          />
                        );

                      case "reasoning":
                        return (
                          <div
                            key={partIndex}
                            className="mt-2 p-2.5 bg-[#111] rounded-md border border-[#2a2a2a]"
                          >
                            <span className="text-[10px] font-medium text-neutral-600 uppercase tracking-wider block mb-1">
                              Reasoning
                            </span>
                            <span className="text-xs text-neutral-500">
                              {part.reasoning}
                            </span>
                          </div>
                        );

                      case "tool-invocation": {
                        const tool = part.toolInvocation;
                        const args = (tool as { args?: Record<string, string> }).args ?? {};
                        const isDone = tool.state === "result";

                        let label = tool.toolName;
                        if (tool.toolName === "str_replace_editor" && args.path) {
                          const cmd = args.command ?? "";
                          const short =
                            args.path.split("/").pop() ?? args.path;
                          const cmdLabel: Record<string, string> = {
                            create: "Creating",
                            str_replace: "Editing",
                            insert: "Inserting into",
                            view: "Viewing",
                            undo_edit: "Undoing edit in",
                          };
                          label = `${cmdLabel[cmd] ?? cmd} ${short}`;
                        } else if (
                          tool.toolName === "file_manager" &&
                          args.path
                        ) {
                          const short =
                            args.path.split("/").pop() ?? args.path;
                          label =
                            args.command === "rename"
                              ? `Renaming ${short}`
                              : `Deleting ${short}`;
                        }

                        return (
                          <div
                            key={partIndex}
                            className="inline-flex items-center gap-2 mt-1.5 px-2.5 py-1 bg-[#111] rounded-md text-xs font-mono border border-[#2a2a2a]"
                          >
                            {isDone ? (
                              <>
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                                <span className="text-neutral-600">{label}</span>
                              </>
                            ) : (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin text-blue-500 flex-shrink-0" />
                                <span className="text-neutral-400">{label}</span>
                              </>
                            )}
                          </div>
                        );
                      }

                      case "source":
                        return null;

                      case "step-start":
                        return partIndex > 0 ? (
                          <hr
                            key={partIndex}
                            className="my-2 border-[#2a2a2a]"
                          />
                        ) : null;

                      default:
                        return null;
                    }
                  })}

                  {isLoading &&
                    message.role === "assistant" &&
                    messages.indexOf(message) === messages.length - 1 && (
                      <div className="flex items-center gap-2 mt-2 text-neutral-600">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="text-xs">Generating…</span>
                      </div>
                    )}
                </>
              ) : message.content ? (
                message.role === "user" ? (
                  <span className="whitespace-pre-wrap">{message.content}</span>
                ) : (
                  <MarkdownRenderer
                    content={message.content}
                    className="prose-sm prose-invert"
                  />
                )
              ) : isLoading &&
                message.role === "assistant" &&
                messages.indexOf(message) === messages.length - 1 ? (
                <div className="flex items-center gap-2 text-neutral-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="text-xs">Generating…</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* User avatar spacer — keeps alignment */}
          {message.role === "user" && (
            <div className="w-7 flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}
