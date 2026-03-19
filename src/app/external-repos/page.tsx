import { redirect } from "next/navigation";
import Link from "next/link";
import { Network } from "lucide-react";
import { getUser } from "@/actions";
import { listExternalRepos } from "@/actions/register-external-repo";
import { ExternalReposClient } from "./ExternalReposClient";

export const metadata = { title: "Mesh Nodes — UIGen" };

export default async function ExternalReposPage() {
  const user = await getUser();
  if (!user) redirect("/");

  const repos = await listExternalRepos();

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-lg font-semibold text-neutral-900 tracking-tight hover:text-neutral-700 transition-colors"
            >
              UIGen
            </Link>
            <span className="text-neutral-300">/</span>
            <span className="text-sm text-neutral-600">Mesh Nodes</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Network className="h-3.5 w-3.5" />
            Sovereign Mesh — §22
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900">Mesh Nodes</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Register Sifiso OS nodes to enable distributed builds, peer orchestration, and quorum voting across the sovereign mesh.
          </p>
        </div>

        <ExternalReposClient initialRepos={repos} />
      </main>
    </div>
  );
}
