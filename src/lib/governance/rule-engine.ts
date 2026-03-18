import "server-only";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConditionOperator = "eq" | "neq" | "lt" | "gt" | "lte" | "gte" | "contains";

export interface RuleCondition {
  /** Dot-notation path into the event's details object, e.g. "status" or "newScore". */
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

export type ActionType =
  | "LOCK_BRANCH"             // lock all release/* branches for the event's projectId
  | "DEMOTE_AGENT"            // lower AgentReputation.score; log AGENT_DEMOTED
  | "TRIGGER_AGGREGATION"     // aggregate descendant metrics for the artifact
  | "ANALYZE_SPECIALIZATIONS" // recompute AgentSkillMetric + assignAgentRoles for the agent
  | "LOG_EVENT";              // emit an additional GovernanceEvent

export interface RuleAction {
  type: ActionType;
  params?: Record<string, unknown>;
}

export interface FiredRule {
  ruleId: string;
  ruleName: string;
  actionType: ActionType;
  builtIn?: boolean;
}

export interface ProcessEventResult {
  eventType: string;
  firedRules: FiredRule[];
}

// ── Built-in rules ────────────────────────────────────────────────────────────

interface BuiltInRule {
  id: string;
  name: string;
  eventType: string;
  condition: RuleCondition | null;
  action: RuleAction;
}

const BUILT_IN_RULES: BuiltInRule[] = [
  {
    id: "builtin:lock-on-eval-fail",
    name: "Lock release/* on evaluation failure",
    eventType: "EVALUATION_RUN_COMPLETED",
    condition: { field: "status", operator: "eq", value: "FAILED" },
    action: { type: "LOCK_BRANCH", params: { branchPrefix: "release/" } },
  },
  {
    id: "builtin:demote-low-reputation",
    name: "Demote agent when reputation falls below 0.4",
    eventType: "AGENT_REPUTATION_UPDATED",
    condition: { field: "newScore", operator: "lt", value: 0.4 },
    action: { type: "DEMOTE_AGENT" },
  },
  {
    id: "builtin:aggregate-on-publish",
    name: "Aggregate descendant metrics on variant publish",
    eventType: "ARTIFACT_VARIANT_PUBLISHED",
    condition: null,
    action: { type: "TRIGGER_AGGREGATION" },
  },
  {
    id: "builtin:analyze-specializations-on-reputation",
    name: "Recompute agent specializations when reputation is updated",
    eventType: "AGENT_REPUTATION_UPDATED",
    condition: null,
    action: { type: "ANALYZE_SPECIALIZATIONS" },
  },
];

// ── Condition evaluator ───────────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function evaluateCondition(
  condition: RuleCondition,
  details: Record<string, unknown>
): boolean {
  const actual = getNestedValue(details, condition.field);
  const expected = condition.value;

  switch (condition.operator) {
    case "eq":       return actual === expected;
    case "neq":      return actual !== expected;
    case "lt":       return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "gt":       return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "lte":      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "gte":      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "contains": return typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
    default:         return false;
  }
}

// ── Action executor ───────────────────────────────────────────────────────────

async function executeAction(
  action: RuleAction,
  event: { projectId: string; type: string; details: Record<string, unknown> }
): Promise<void> {
  switch (action.type) {
    case "LOCK_BRANCH": {
      const prefix = (action.params?.branchPrefix as string) ?? "release/";
      const policies = await prisma.branchPolicy.findMany({
        where: { projectId: event.projectId },
        select: { id: true, branchName: true, policyType: true },
      });
      const toLock = policies.filter(
        (p) => p.branchName.startsWith(prefix) && p.policyType !== "LOCKED"
      );
      for (const policy of toLock) {
        await prisma.branchPolicy.update({
          where: { id: policy.id },
          data: { policyType: "LOCKED" },
        });
        await prisma.governanceEvent.create({
          data: {
            projectId: event.projectId,
            type: "BRANCH_POLICY_CHANGED",
            actor: "rule-engine",
            details: {
              branchName: policy.branchName,
              previousPolicy: policy.policyType,
              newPolicy: "LOCKED",
              triggeredBy: event.type,
            },
          },
        });
      }
      break;
    }

    case "DEMOTE_AGENT": {
      const agentName = event.details.agentName as string | undefined;
      if (!agentName) break;
      await prisma.agentReputation.updateMany({
        where: { agentName },
        data: { score: 0.3 },
      });
      await prisma.governanceEvent.create({
        data: {
          projectId: event.projectId,
          type: "AGENT_DEMOTED",
          actor: "rule-engine",
          details: {
            agentName,
            reason: "Reputation score fell below threshold (0.4)",
            triggeredBy: event.type,
          },
        },
      });
      break;
    }

    case "TRIGGER_AGGREGATION": {
      const artifactId =
        (event.details.parentArtifactId as string | undefined) ??
        (event.details.artifactId as string | undefined);
      if (!artifactId) break;
      const { aggregateDescendantMetrics } = await import(
        "@/actions/aggregate-descendant-metrics"
      );
      // Non-fatal: aggregation failure should not block the caller
      await aggregateDescendantMetrics({ artifactId }).catch(() => undefined);
      break;
    }

    case "ANALYZE_SPECIALIZATIONS": {
      const agentName = event.details.agentName as string | undefined;
      if (!agentName) break;
      const { analyzeAgentSpecializations } = await import(
        "@/actions/analyze-agent-specializations"
      );
      const { assignAgentRoles } = await import("@/actions/assign-agent-roles");
      // Non-fatal: do not block caller on specialization or role assignment failure
      await analyzeAgentSpecializations({ agentName, projectId: event.projectId }).catch(() => undefined);
      await assignAgentRoles({ projectId: event.projectId }).catch(() => undefined);
      break;
    }

    case "LOG_EVENT": {
      const logType = (action.params?.eventType as string) ?? "RULE_ACTION_FIRED";
      await prisma.governanceEvent.create({
        data: {
          projectId: event.projectId,
          type: logType,
          actor: "rule-engine",
          details: { triggeredBy: event.type, ...action.params },
        },
      });
      break;
    }
  }
}

// ── Engine entry point ────────────────────────────────────────────────────────

/**
 * Process a governance event against all enabled rules (built-in + DB).
 *
 * Rules are matched by eventType; if a condition is present it must pass.
 * Actions are executed sequentially; individual failures are swallowed so
 * one bad rule never blocks others or the calling action.
 */
export async function processGovernanceEvent(event: {
  type: string;
  projectId: string;
  details: Record<string, unknown>;
}): Promise<ProcessEventResult> {
  const firedRules: FiredRule[] = [];

  // 1. Built-in rules
  for (const rule of BUILT_IN_RULES) {
    if (rule.eventType !== event.type) continue;
    if (rule.condition && !evaluateCondition(rule.condition, event.details)) continue;

    try {
      await executeAction(rule.action, event);
      firedRules.push({
        ruleId: rule.id,
        ruleName: rule.name,
        actionType: rule.action.type,
        builtIn: true,
      });
    } catch {
      // non-fatal
    }
  }

  // 2. DB rules
  const dbRules = await prisma.governanceRule.findMany({
    where: { eventType: event.type, enabled: true },
  });

  for (const rule of dbRules) {
    const condition = rule.condition as RuleCondition | null;
    if (condition && !evaluateCondition(condition, event.details)) continue;

    const action = rule.action as unknown as RuleAction;
    try {
      await executeAction(action, event);
      firedRules.push({
        ruleId: rule.id,
        ruleName: rule.name,
        actionType: action.type,
      });
    } catch {
      // non-fatal
    }
  }

  return { eventType: event.type, firedRules };
}
