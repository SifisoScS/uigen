import type { FileNode } from "@/lib/file-system";
import dashboardStarter from "./dashboard-starter.json";
import landingStarter from "./landing-starter.json";
import authStarter from "./auth-starter.json";
import userProfileStarter from "./user-profile-starter.json";
import ecommerceStarter from "./ecommerce-starter.json";
import blogPostStarter from "./blog-post-starter.json";
import settingsStarter from "./settings-starter.json";

export interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  /** Lucide icon name rendered in the UI */
  icon: string;
  files: Record<string, FileNode>;
}

const templates: StarterTemplate[] = [
  { id: "dashboard",    ...dashboardStarter,    files: dashboardStarter.files    as Record<string, FileNode> },
  { id: "landing",      ...landingStarter,      files: landingStarter.files      as Record<string, FileNode> },
  { id: "auth",         ...authStarter,         files: authStarter.files         as Record<string, FileNode> },
  { id: "user-profile", ...userProfileStarter,  files: userProfileStarter.files  as Record<string, FileNode> },
  { id: "ecommerce",    ...ecommerceStarter,    files: ecommerceStarter.files    as Record<string, FileNode> },
  { id: "blog-post",    ...blogPostStarter,     files: blogPostStarter.files     as Record<string, FileNode> },
  { id: "settings",     ...settingsStarter,     files: settingsStarter.files     as Record<string, FileNode> },
];

/** Returns all available starter templates. */
export function getTemplates(): StarterTemplate[] {
  return templates;
}

/** Returns a single template by id, or null if not found. */
export function getTemplate(id: string): StarterTemplate | null {
  return templates.find((t) => t.id === id) ?? null;
}
