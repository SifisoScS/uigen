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
    <div className="min-h-screen bg-[#050816] relative">

      {/* Atmospheric orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-8%] top-[-8%] h-[26rem] w-[26rem] rounded-full bg-violet-500/16 blur-[120px] animate-drift" />
        <div className="absolute right-[-5%] top-[8%] h-[24rem] w-[24rem] rounded-full bg-cyan-500/14 blur-[120px] animate-drift-delayed" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:80px_80px] opacity-[0.10]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/10 bg-white/[0.03] backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-semibold text-white/85 hover:text-white transition"
            >
              UIGen
            </Link>
            <span className="text-white/20">/</span>
            <span className="text-sm text-white/45">Mesh Nodes</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/35 uppercase tracking-[0.24em]">
            <Network className="h-3.5 w-3.5" />
            Sovereign Mesh · §22
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-[11px] text-white/35 uppercase tracking-[0.32em] font-medium mb-3">
            Sovereign infrastructure
          </p>
          <h1 className="text-3xl font-semibold text-white">Mesh Nodes</h1>
          <p className="mt-2 text-sm text-white/50 leading-relaxed max-w-2xl">
            Register Sifiso OS nodes to enable distributed builds, peer orchestration,
            and quorum voting across the sovereign mesh.
          </p>
        </div>

        <ExternalReposClient initialRepos={repos} />
      </main>
    </div>
  );
}
