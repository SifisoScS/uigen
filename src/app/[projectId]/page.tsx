import { getUser } from "@/actions";
import { getProject } from "@/actions/get-project";
import { MainContent } from "@/app/main-content";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  const user = await getUser();

  let project;
  try {
    project = await getProject(projectId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "Project not found" || message === "Unauthorized") {
      redirect("/");
    }
    throw err;
  }

  return <MainContent user={user} project={project} />;
}
