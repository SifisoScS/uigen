"use client";

import { useState } from "react";
import { FileNode } from "@/lib/file-system";
import { useFileSystem } from "@/lib/contexts/file-system-context";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileTreeNodeProps {
  node: FileNode;
  level: number;
}

function FileTreeNode({ node, level }: FileTreeNodeProps) {
  const { selectedFile, setSelectedFile } = useFileSystem();
  const [isExpanded, setIsExpanded] = useState(true);

  const handleClick = () => {
    if (node.type === "directory") {
      setIsExpanded(!isExpanded);
    } else {
      setSelectedFile(node.path);
    }
  };

  const children =
    node.type === "directory" && node.children
      ? Array.from(node.children.values()).sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
      : [];

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 py-1 cursor-pointer text-xs transition-colors select-none",
          selectedFile === node.path
            ? "bg-[#1e2d47] text-blue-300"
            : "text-neutral-500 hover:text-neutral-300 hover:bg-[#181818]"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px`, paddingRight: "8px" }}
        onClick={handleClick}
      >
        {node.type === "directory" ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-neutral-600" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-neutral-600" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-blue-500/70" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-blue-500/70" />
            )}
          </>
        ) : (
          <>
            <div className="w-3 shrink-0" />
            <FileCode className="h-3.5 w-3.5 shrink-0 text-neutral-600" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>
      {node.type === "directory" && isExpanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FileTreeNode key={child.path} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree() {
  const { fileSystem } = useFileSystem();
  const rootNode = fileSystem.getNode("/");

  if (!rootNode || !rootNode.children || rootNode.children.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <Folder className="h-8 w-8 text-neutral-700 mb-2" />
        <p className="text-xs text-neutral-600">No files yet</p>
      </div>
    );
  }

  const rootChildren = Array.from(rootNode.children.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <ScrollArea className="h-full">
      <div className="py-2">
        <div className="text-[10px] font-medium text-neutral-700 uppercase tracking-wider px-3 mb-1.5">
          Files
        </div>
        {rootChildren.map((child) => (
          <FileTreeNode key={child.path} node={child} level={0} />
        ))}
      </div>
    </ScrollArea>
  );
}
