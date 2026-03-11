"use client";

import { useState } from "react";
import { Globe, Lock, Link, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { toggleProjectPublic } from "@/actions/toggle-project-public";

interface ShareButtonProps {
  projectId: string;
  isPublic: boolean;
}

export function ShareButton({ projectId, isPublic: initialIsPublic }: ShareButtonProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      await toggleProjectPublic(projectId, !isPublic);
      setIsPublic(!isPublic);
      toast.success(isPublic ? "Project set to private" : "Project is now public — share the link!");
    } catch {
      toast.error("Failed to update sharing settings");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyLink() {
    const url = `${window.location.origin}/${projectId}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={loading}
          aria-label="Share project"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isPublic ? (
            <Globe className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          )}
          Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-1.5">
          <p className="text-xs font-medium text-neutral-300">Share project</p>
          <p className="text-[11px] text-neutral-500 mt-0.5">
            {isPublic
              ? "Anyone with the link can view this project"
              : "Only you can access this project"}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleToggle} disabled={loading} className="gap-2">
          {isPublic ? (
            <>
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              Make private
            </>
          ) : (
            <>
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              Make public
            </>
          )}
        </DropdownMenuItem>
        {isPublic && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleCopyLink} className="gap-2">
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Link className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              Copy link
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
