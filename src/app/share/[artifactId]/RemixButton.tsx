"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitFork, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { remixArtifact } from "@/actions/remix-artifact";
import { toast } from "sonner";

export function RemixButton({ artifactId }: { artifactId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRemix() {
    setLoading(true);
    try {
      const { projectId } = await remixArtifact(artifactId);
      toast.success("Remix created — opening your project…");
      router.push(`/${projectId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remix failed");
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handleRemix}
      disabled={loading}
      className="gap-2"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <GitFork className="h-4 w-4" />
      )}
      Remix this artifact
    </Button>
  );
}
