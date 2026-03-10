import { getUser } from "@/actions";
import { getProject } from "@/actions/get-project";
import { MainContent } from "@/app/main-content";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  // getUser() returns null for anonymous visitors — that's fine.
  // Anonymous projects (userId === null in DB) are accessible without auth.
  const user = await getUser();

  let project;
  try {
    project = await getProject(projectId);
  } catch {
    // Project not found or requester doesn't own it — send back to home.
    redirect("/");
  }

  return <MainContent user={user} project={project} />;
}
