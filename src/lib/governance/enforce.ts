import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Enforce the branch policy for a mutation.
 *
 * - Auto-creates a BranchPolicy record on first use based on branch prefix.
 * - release/* is permanently blocked for all direct mutations (WRITE, RESTORE, FORK).
 * - AI_ONLY blocks HUMAN actors; HUMAN_ONLY blocks AI actors; LOCKED blocks all.
 * - Logs a GovernanceEvent whenever a policy is first created.
 */
export async function enforceBranchPolicy({
  projectId,
  branchName,
  actorType,
  actionType,
}: {
  projectId: string;
  branchName: string;
  actorType: "AI" | "HUMAN";
  actionType: string;
}): Promise<void> {
  let policy = await prisma.branchPolicy.findUnique({
    where: { projectId_branchName: { projectId, branchName } },
    select: { policyType: true },
  });

  if (!policy) {
    let defaultType = "OPEN";
    if (branchName.startsWith("protected/")) defaultType = "AI_ONLY";
    if (branchName.startsWith("release/")) defaultType = "HUMAN_ONLY";

    policy = await prisma.branchPolicy.create({
      data: {
        projectId,
        branchName,
        policyType: defaultType,
        createdBy: actorType === "AI" ? "claude" : "human-user",
      },
      select: { policyType: true },
    });

    await prisma.governanceEvent.create({
      data: {
        projectId,
        type: "BRANCH_POLICY_SET",
        actor: actorType === "AI" ? "claude" : "human-user",
        details: { branchName, policyType: defaultType },
      },
    });
  }

  // Hard invariant: release/* branches are immutable except via explicit merge
  if (branchName.startsWith("release/") && actionType !== "MERGE") {
    throw new Error(
      `Direct mutations to release/* branches are forbidden. Only merges from protected branches are allowed.`
    );
  }

  if (policy.policyType === "LOCKED") {
    throw new Error(`Branch "${branchName}" is LOCKED — no mutations allowed.`);
  }

  const isAllowed =
    policy.policyType === "OPEN" ||
    (policy.policyType === "AI_ONLY" && actorType === "AI") ||
    (policy.policyType === "HUMAN_ONLY" && actorType === "HUMAN");

  if (!isAllowed) {
    throw new Error(
      `Policy violation: ${policy.policyType} blocks ${actorType} actions on branch "${branchName}"`
    );
  }
}

/**
 * Register a BranchPolicy for a branch on first use without enforcing it.
 * Call this when a branch name is first assigned (e.g. from set-branch)
 * so every branch has a queryable policy record from the start.
 */
export async function registerBranchPolicy(
  projectId: string,
  branchName: string,
  actorType: "AI" | "HUMAN"
): Promise<void> {
  const existing = await prisma.branchPolicy.findUnique({
    where: { projectId_branchName: { projectId, branchName } },
    select: { id: true },
  });
  if (existing) return;

  let defaultType = "OPEN";
  if (branchName.startsWith("protected/")) defaultType = "AI_ONLY";
  if (branchName.startsWith("release/")) defaultType = "HUMAN_ONLY";

  await prisma.branchPolicy.create({
    data: {
      projectId,
      branchName,
      policyType: defaultType,
      createdBy: actorType === "AI" ? "claude" : "human-user",
    },
  });

  await prisma.governanceEvent.create({
    data: {
      projectId,
      type: "BRANCH_POLICY_SET",
      actor: actorType === "AI" ? "claude" : "human-user",
      details: { branchName, policyType: defaultType },
    },
  });
}
