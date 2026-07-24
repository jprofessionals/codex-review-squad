import {assertStrictOutputSchema} from "./strict-output-schema.mjs";

const evidenceSchema = {
  type: "array",
  minItems: 1,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["path", "detail"],
    properties: {path: {type: "string"}, detail: {type: "string"}}
  }
};

const findingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["severity", "title", "description", "evidence", "confidence"],
  properties: {
    severity: {type: "string", enum: ["critical", "important", "minor"]},
    title: {type: "string"},
    description: {type: "string"},
    evidence: evidenceSchema,
    confidence: {type: ["string", "null"], enum: ["high", "medium", "low", null]}
  }
};

const ambientReviewSquadSchema = {
  type: "object",
  additionalProperties: false,
  required: ["inventory_source", "skill_locators"],
  properties: {
    inventory_source: {type: "string", enum: ["system_available_skills", "not_exposed"]},
    skill_locators: {type: "array", items: {type: "string"}}
  }
};

export function controlledSchema(subjectId, caseIds) {
  return assertStrictOutputSchema({
    type: "object",
    additionalProperties: false,
    required: ["evaluation_subject", "ambient_review_squad", "case_results"],
    properties: {
      evaluation_subject: {type: "string", const: subjectId},
      ambient_review_squad: ambientReviewSquadSchema,
      case_results: {
        type: "array",
        minItems: caseIds.length,
        maxItems: caseIds.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["case_id", "findings", "not_verified"],
          properties: {
            case_id: {type: "string", enum: caseIds},
            findings: {type: "array", items: findingSchema},
            not_verified: {type: "array", items: {type: "string"}}
          }
        }
      }
    }
  }, {name: "controlled evaluation schema"});
}

export function productionSchema(subjectId, caseId, {minimum_lanes: minItems, maximum_lanes: maxItems}) {
  const lane = {
    type: "object",
    additionalProperties: false,
    required: ["lane_id", "delegation_call_id", "returned_agent_id", "returned_task_name", "raw_delegated_response", "completion", "failure", "raw_findings", "not_verified", "requested_model", "requested_reasoning_effort", "observed_model", "observed_reasoning_effort"],
    properties: {
      lane_id: {type: "string"},
      delegation_call_id: {type: ["string", "null"]},
      returned_agent_id: {type: ["string", "null"]},
      returned_task_name: {type: ["string", "null"]},
      raw_delegated_response: {type: ["string", "null"]},
      completion: {type: "string", enum: ["completed", "failed"]},
      failure: {type: ["string", "null"]},
      raw_findings: {type: "array", items: findingSchema},
      not_verified: {type: "array", items: {type: "string"}},
      requested_model: {type: ["string", "null"]},
      requested_reasoning_effort: {type: ["string", "null"]},
      observed_model: {type: ["string", "null"]},
      observed_reasoning_effort: {type: ["string", "null"]}
    }
  };
  return assertStrictOutputSchema({
    type: "object",
    additionalProperties: false,
    required: ["evaluation_subject", "ambient_review_squad", "case_id", "lane_results", "consolidated_findings", "not_verified"],
    properties: {
      evaluation_subject: {type: "string", const: subjectId},
      ambient_review_squad: ambientReviewSquadSchema,
      case_id: {type: "string", const: caseId},
      lane_results: {type: "array", minItems, maxItems, items: lane},
      consolidated_findings: {type: "array", items: findingSchema},
      not_verified: {type: "array", items: {type: "string"}}
    }
  }, {name: "production evaluation schema"});
}

export function scorerSchema() {
  return assertStrictOutputSchema({
    type: "object",
    additionalProperties: false,
    required: ["scorer", "ambient_review_squad", "ledger"],
    properties: {
      scorer: {type: "string"},
      ambient_review_squad: ambientReviewSquadSchema,
      ledger: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["phase", "call_id", "case_id", "finding_index", "root_id", "evidence_valid", "severity_exact"],
          properties: {
            phase: {type: "string", enum: ["controlled_quality", "production_behavior"]},
            call_id: {type: "string"},
            case_id: {type: "string"},
            finding_index: {type: "integer", minimum: 0},
            root_id: {type: "string"},
            evidence_valid: {type: "boolean"},
            severity_exact: {type: "boolean"}
          }
        }
      }
    }
  }, {name: "scorer evaluation schema"});
}

export function verifyEvaluationSchemas({subjectIds, controlledCaseSets, productionCaseIds, productionContracts}) {
  let checked = 0;
  for (const subjectId of subjectIds) {
    for (const caseIds of controlledCaseSets) {
      controlledSchema(subjectId, caseIds);
      checked += 1;
    }
    for (const caseId of productionCaseIds) {
      productionSchema(subjectId, caseId, productionContracts[subjectId]);
      checked += 1;
    }
  }
  scorerSchema();
  checked += 1;
  productionSchema("v0.3.0", "backend-seeded", {minimum_lanes: 3, maximum_lanes: 3});
  checked += 1;
  return {status: "passed_before_first_model_call", schemas_checked: checked};
}
