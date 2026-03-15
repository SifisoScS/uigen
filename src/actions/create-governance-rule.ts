"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RuleCondition, RuleAction } from "@/lib/governance/rule-engine";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateGovernanceRuleInput {
  name: string;
  description?: string;
  eventType: string;
  condition?: RuleCondition;
  action: RuleAction;
  enabled?: boolean;
}

export interface GovernanceRuleRecord {
  id: string;
  name: string;
  description: string | null;
  eventType: string;
  condition: RuleCondition | null;
  action: RuleAction;
  enabled: boolean;
  createdAt: Date;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function createGovernanceRule(
  input: CreateGovernanceRuleInput
): Promise<GovernanceRuleRecord> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const name = input.name.trim();
  if (!name) throw new Error("Rule name cannot be empty");
  if (!input.eventType.trim()) throw new Error("eventType cannot be empty");

  const rule = await prisma.governanceRule.create({
    data: {
      name,
      description: input.description ?? null,
      eventType: input.eventType.trim(),
      condition: (input.condition ?? null) as never,
      action: input.action as never,
      enabled: input.enabled ?? true,
    },
    select: {
      id: true,
      name: true,
      description: true,
      eventType: true,
      condition: true,
      action: true,
      enabled: true,
      createdAt: true,
    },
  });

  return {
    ...rule,
    condition: rule.condition as RuleCondition | null,
    action: rule.action as unknown as RuleAction,
  };
}

export async function toggleGovernanceRule(
  ruleId: string,
  enabled: boolean
): Promise<{ id: string; enabled: boolean }> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const rule = await prisma.governanceRule.findUnique({
    where: { id: ruleId },
    select: { id: true },
  });
  if (!rule) throw new Error("Governance rule not found");

  const updated = await prisma.governanceRule.update({
    where: { id: ruleId },
    data: { enabled },
    select: { id: true, enabled: true },
  });

  return updated;
}
