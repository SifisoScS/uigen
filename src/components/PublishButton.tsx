"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { publishArtifact } from "@/actions/publish-artifact";
import { getCurrentBranchPolicy } from "@/actions/get-current-branch-policy";
import { toast } from "sonner";

interface PublishButtonProps {
  projectId: string;
}

export function PublishButton({ projectId }: PublishButtonProps) {
  const router = useRouter();
  const [branchName, setBranchName] = useState<string | null>(null);
  const [policyType, setPolicyType] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [tagsInput, setTagsInput] = useState("");

  useEffect(() => {
    getCurrentBranchPolicy(projectId)
      .then(({ branchName: b, policyType: p }) => {
        setBranchName(b);
        setPolicyType(p);
      })
      .catch(() => {});
  }, [projectId]);

  // Only render the button when we're on a governed release branch
  const canPublish =
    branchName?.startsWith("release/") && policyType === "HUMAN_ONLY";

  if (!canPublish) return null;

  async function handlePublish() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!branchName) return;

    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const { artifactId } = await publishArtifact({
        projectId,
        branchName,
        name: name.trim(),
        description: description.trim() || undefined,
        version: version.trim() || "1.0.0",
        tags,
      });

      toast.success("Artifact published!");
      setDialogOpen(false);
      router.push(`/share/${artifactId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-xs border-emerald-800 text-emerald-400 hover:bg-emerald-950 hover:text-emerald-300"
        onClick={() => setDialogOpen(true)}
      >
        <Upload className="h-3.5 w-3.5" />
        Publish
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#111111] border-[#2a2a2a] text-neutral-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-neutral-100 flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-400" />
              Publish Artifact
            </DialogTitle>
            <DialogDescription className="text-neutral-500">
              Publishing from{" "}
              <code className="text-emerald-400 text-xs">{branchName}</code> —
              governed release branch (HUMAN_ONLY)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">
                Name <span className="text-red-400">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Component"
                className="bg-[#1a1a1a] border-[#333] text-neutral-100 placeholder:text-neutral-600 focus-visible:ring-emerald-600"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Description</Label>
              <textarea
                value={description}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setDescription(e.target.value)
                }
                placeholder="What does this artifact do?"
                rows={3}
                className="w-full rounded-md border border-[#333] bg-[#1a1a1a] px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 resize-none outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-neutral-400">Version</Label>
                <Input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0.0"
                  className="bg-[#1a1a1a] border-[#333] text-neutral-100 placeholder:text-neutral-600 focus-visible:ring-emerald-600"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-neutral-400">
                  Tags (comma-separated)
                </Label>
                <Input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="button, shadcn, ui"
                  className="bg-[#1a1a1a] border-[#333] text-neutral-100 placeholder:text-neutral-600 focus-visible:ring-emerald-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
                className="text-neutral-400 hover:text-neutral-200"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handlePublish}
                disabled={submitting || !name.trim()}
                className="bg-emerald-700 hover:bg-emerald-600 text-white gap-1.5"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Publish artifact
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
