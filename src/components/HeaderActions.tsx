"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  LogOut,
  FolderOpen,
  ChevronDown,
  LayoutGrid,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { ExportButton } from "@/components/ExportButton";
import { signOut } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { deleteProject } from "@/actions/delete-project";
import { renameProject } from "@/actions/rename-project";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderActionsProps {
  user?: {
    id: string;
    email: string;
  } | null;
  projectId?: string;
}

interface Project {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export function HeaderActions({ user, projectId }: HeaderActionsProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Rename state for the current project
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameInput, setRenameInput] = useState("");
  const [currentName, setCurrentName] = useState<string | undefined>(
    undefined
  );

  // Load projects initially
  useEffect(() => {
    if (user && projectId) {
      getProjects()
        .then((p) => {
          setProjects(p);
          const current = p.find((x) => x.id === projectId);
          if (current) setCurrentName(current.name);
        })
        .catch(console.error)
        .finally(() => setInitialLoading(false));
    } else {
      setInitialLoading(false);
    }
  }, [user, projectId]);

  // Refresh projects when popover opens
  useEffect(() => {
    if (user && projectsOpen) {
      getProjects().then(setProjects).catch(console.error);
    }
  }, [projectsOpen, user]);

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSignInClick = () => {
    setAuthMode("signin");
    setAuthDialogOpen(true);
  };

  const handleSignUpClick = () => {
    setAuthMode("signup");
    setAuthDialogOpen(true);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleNewDesign = async () => {
    const project = await createProject({
      name: `Design #${~~(Math.random() * 100000)}`,
      messages: [],
      data: {},
    });
    router.push(`/${project.id}`);
  };

  const handleRenameStart = () => {
    setRenameInput(currentName ?? "");
    setIsRenaming(true);
  };

  const handleRenameConfirm = () => {
    const trimmed = renameInput.trim();
    if (!trimmed || !projectId || trimmed === currentName) {
      setIsRenaming(false);
      return;
    }
    startTransition(async () => {
      try {
        await renameProject(projectId, trimmed);
        setCurrentName(trimmed);
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, name: trimmed } : p))
        );
      } finally {
        setIsRenaming(false);
      }
    });
  };

  const handleRenameCancel = () => {
    setIsRenaming(false);
    setRenameInput(currentName ?? "");
  };

  const handleDelete = () => {
    if (!projectId || !currentName) return;
    if (!confirm(`Delete "${currentName}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deleteProject(projectId);
      router.push("/");
    });
  };

  if (!user) {
    return (
      <>
        <div className="flex items-center gap-2">
          {projectId && <ExportButton />}
          <Button variant="outline" className="h-8" onClick={handleSignInClick}>
            Sign In
          </Button>
          <Button className="h-8" onClick={handleSignUpClick}>
            Sign Up
          </Button>
        </div>
        <AuthDialog
          open={authDialogOpen}
          onOpenChange={setAuthDialogOpen}
          defaultMode={authMode}
        />
      </>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Current project name with rename inline or popover to switch */}
      {!initialLoading && projectId && (
        isRenaming ? (
          <div className="flex items-center gap-1">
            <Input
              autoFocus
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameConfirm();
                if (e.key === "Escape") handleRenameCancel();
              }}
              className="h-8 w-40 text-sm"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRenameConfirm}
              title="Confirm rename"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRenameCancel}
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Popover open={projectsOpen} onOpenChange={setProjectsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-8 gap-2 max-w-[200px]"
                  role="combobox"
                >
                  <FolderOpen className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {currentName ?? "Select Project"}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="end">
                <Command>
                  <CommandInput
                    placeholder="Search projects..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>No projects found.</CommandEmpty>
                    <CommandGroup>
                      {filteredProjects.map((project) => (
                        <CommandItem
                          key={project.id}
                          value={project.name}
                          onSelect={() => {
                            router.push(`/${project.id}`);
                            setProjectsOpen(false);
                            setSearchQuery("");
                          }}
                        >
                          <span className="font-medium">{project.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          router.push("/projects");
                          setProjectsOpen(false);
                        }}
                      >
                        <LayoutGrid className="h-4 w-4 mr-2" />
                        All projects
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Per-project actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Project actions"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleRenameStart}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={handleDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      )}

      {projectId && <ExportButton projectName={currentName} />}

      <Button className="flex items-center gap-2 h-8" onClick={handleNewDesign}>
        <Plus className="h-4 w-4" />
        New Design
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleSignOut}
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
