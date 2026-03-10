import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { ProjectCard } from "./ProjectCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { createProject } from "@/actions/create-project";

export const metadata = { title: "Projects — UIGen" };

export default async function ProjectsPage() {
  const user = await getUser();
  if (!user) redirect("/");

  const projects = await getProjects();

  async function handleNewProject() {
    "use server";
    const project = await createProject({
      name: `New Design #${~~(Math.random() * 100000)}`,
      messages: [],
      data: {},
    });
    redirect(`/${project.id}`);
  }

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
            <span className="text-sm text-neutral-600">Projects</span>
          </div>
          <form action={handleNewProject}>
            <Button type="submit" size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </form>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900">
            Your Projects
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{user.email}</p>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20 text-neutral-400">
            <p className="text-lg font-medium">No projects yet</p>
            <p className="mt-1 text-sm">Create your first project to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
