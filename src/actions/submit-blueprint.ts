"use server";

import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkWithSovereignGate } from "@/lib/sifiso-gate";
import {
  forgeValidateBlueprint,
  forgeSubmitBuild,
  type Blueprint,
  type BuildGrant,
} from "@/lib/forge";
import { ikhayaNarrate } from "@/lib/ikhaya";

export interface SubmitBlueprintInput {
  blueprintId: string;
  artifactType: string;
  name: string;
  description?: string;
  components: string[];
  filesHash?: string;
  semanticSummary?: string;
}

export interface SubmitBlueprintResult {
  buildId: string;
  state: string;
  ubuntuScore: number;
  gateLogEntryId: string;
}

/**
 * Submit a UI blueprint to The Forge for construction.
 *
 * Flow:
 *  1. Authenticate session
 *  2. Sovereign Gate pre-flight check (action: "blueprint_submit")
 *  3. Construct BuildGrant from gate result
 *  4. Validate blueprint via Forge
 *  5. Submit build request to Forge
 *  6. Log GovernanceEvent FORGE_BUILD_SUBMITTED
 *  7. Request iKhaya narrative
 *  8. Return { buildId, state, ubuntuScore }
 */
export async function submitBlueprint(
  input: SubmitBlueprintInput
): Promise<SubmitBlueprintResult> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");

  const systemDid =
    process.env.UIGEN_SYSTEM_DID ?? "did:key:zuigen-system-node-dev";
  const forgeDid =
    process.env.FORGE_DID ?? "did:key:zforge-system-node-dev";

  // 1. Sovereign Gate pre-flight
  const gateResult = await checkWithSovereignGate({
    uigen_action: "blueprint_submit",
    artifact_type: input.artifactType,
    blueprint_description: input.description,
    artifact_name: input.name,
    semantic_summary: input.semanticSummary,
  });

  // 2. Construct BuildGrant
  const grant: BuildGrant = {
    grant_id: gateResult.log_entry_id,
    approved_by: systemDid,
    signature: `${forgeDid}:stub`,
    ubuntu_score: gateResult.ubuntu_score,
  };

  // 3. Build Blueprint
  const blueprint: Blueprint = {
    blueprint_id: input.blueprintId,
    artifact_type: input.artifactType,
    name: input.name,
    description: input.description,
    components: input.components,
    files_hash: input.filesHash,
    semantic_summary: input.semanticSummary,
    requested_by: systemDid,
  };

  // 4. Validate blueprint with Forge
  await forgeValidateBlueprint(blueprint);

  // 5. Submit build
  const buildStatus = await forgeSubmitBuild({ blueprint, grant });

  // 6. Log governance event
  await prisma.governanceEvent.create({
    data: {
      projectId: input.blueprintId,
      type: "FORGE_BUILD_SUBMITTED",
      actor: session.userId,
      details: {
        buildId: buildStatus.build_id,
        blueprintId: input.blueprintId,
        grantId: grant.grant_id,
        ubuntuScore: gateResult.ubuntu_score,
        gateLogEntryId: gateResult.log_entry_id,
        state: buildStatus.state,
      },
    },
  });

  // 7. iKhaya narration
  await ikhayaNarrate({
    artifact_id: input.blueprintId,
    ubuntu_score: gateResult.ubuntu_score,
    gate_log_entry_id: gateResult.log_entry_id,
  });

  return {
    buildId: buildStatus.build_id,
    state: buildStatus.state,
    ubuntuScore: gateResult.ubuntu_score,
    gateLogEntryId: gateResult.log_entry_id,
  };
}
