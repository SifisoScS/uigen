"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useCallback,
} from "react";
import { useChat as useAIChat } from "@ai-sdk/react";
import { Message } from "ai";
import { useFileSystem } from "./file-system-context";
import { setHasAnonWork } from "@/lib/anon-work-tracker";
import { useValidateFs } from "@/lib/hooks/use-validate-fs";

interface ChatContextProps {
  projectId?: string;
  initialMessages?: Message[];
}

interface ChatContextType {
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  status: string;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({
  children,
  projectId,
  initialMessages = [],
}: ChatContextProps & { children: ReactNode }) {
  const { fileSystem, handleToolCall, getAllFiles } = useFileSystem();

  const {
    messages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    status,
    append,
  } = useAIChat({
    api: "/api/chat",
    initialMessages,
    body: {
      files: fileSystem.serialize(),
      projectId,
    },
    onToolCall: ({ toolCall }) => {
      handleToolCall(toolCall);
    },
  });

  // Auto-validation: fires after each generation stream completes.
  // If issues are detected, appends a follow-up message so Claude can self-correct.
  const handleValidationIssues = useCallback(
    (issues: string[]) => {
      if (issues.length === 0) return;
      const list = issues.map((i) => `• ${i}`).join("\n");
      append({
        role: "user",
        content: `[Auto-validator] Found ${issues.length} potential issue${issues.length === 1 ? "" : "s"} in the generated files:\n${list}\n\nShall I fix these automatically?`,
      });
    },
    [append]
  );

  useValidateFs({
    files: getAllFiles(),
    status,
    onIssues: handleValidationIssues,
  });

  // Track anonymous work
  useEffect(() => {
    if (!projectId && messages.length > 0) {
      setHasAnonWork(messages, fileSystem.serialize());
    }
  }, [messages, fileSystem, projectId]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        input,
        setInput,
        handleInputChange,
        handleSubmit,
        status,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}