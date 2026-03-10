import { getUser } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { MainContent } from "./main-content";
import { redirect } from "next/navigation";
import { getTemplates } from "@/lib/templates";

interface HomeProps {
  searchParams: Promise<{ template?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { template: templateId } = await searchParams;
  const user = await getUser();

  // If user is authenticated, redirect to their most recent project or create one
  if (user) {
    // If a template was requested, always create a fresh project from that template
    if (templateId) {
      const templates = getTemplates();
      const matched = templates.find((t) => t.id === templateId);
      const newProject = await createProject({
        name: matched ? matched.name : `New Design #${~~(Math.random() * 100000)}`,
        messages: [],
        data: {},
        templateId,
      });
      redirect(`/${newProject.id}`);
    }

    const projects = await getProjects();
    if (projects.length > 0) {
      redirect(`/${projects[0].id}`);
    }

    const newProject = await createProject({
      name: `New Design #${~~(Math.random() * 100000)}`,
      messages: [],
      data: {},
    });

    redirect(`/${newProject.id}`);
  }

  // For anonymous users, show the welcome screen (with template cards)
  return <MainContent user={user} />;
}
