"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteProject } from "@/actions/delete-project";
import { renameProject } from "@/actions/rename-project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

interface Project {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function ProjectCard({ project }: { project: Project }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(project.name);
  const [displayName, setDisplayName] = useState(project.name);

  const handleOpen = () => router.push(`/${project.id}`);

  const handleRenameSubmit = () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === displayName) {
      setIsRenaming(false);
      setNameInput(displayName);
      return;
    }
    startTransition(async () => {
      try {
        await renameProject(project.id, trimmed);
        setDisplayName(trimmed);
      } catch {
        setNameInput(displayName);
      } finally {
        setIsRenaming(false);
      }
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete "${displayName}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteProject(project.id);
      router.refresh();
    });
  };

  return (
    <div
      className={`group relative bg-white rounded-lg border border-neutral-200 p-4 flex flex-col gap-3 hover:border-neutral-300 hover:shadow-sm transition-all ${
        isPending ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {/* Name / rename input */}
      <div className="flex items-start justify-between gap-2">
        {isRenaming ? (
          <Input
            autoFocus
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") {
                setIsRenaming(false);
                setNameInput(displayName);
              }
            }}
            className="h-7 text-sm font-medium"
          />
        ) : (
          <button
            onClick={handleOpen}
            className="text-sm font-medium text-neutral-900 text-left leading-snug hover:text-neutral-700 transition-colors line-clamp-2"
          >
            {displayName}
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setIsRenaming(true);
                setNameInput(displayName);
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Meta */}
      <p className="text-xs text-neutral-400 mt-auto">
        Updated {formatDate(project.updatedAt)}
      </p>

      {/* Click overlay to open (hidden when renaming) */}
      {!isRenaming && (
        <button
          onClick={handleOpen}
          className="absolute inset-0 rounded-lg"
          aria-label={`Open project ${displayName}`}
        />
      )}
    </div>
  );
}
