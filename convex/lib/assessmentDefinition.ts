export const ASSESSMENT_KEY = "operations_foundation";
export const DEFINITION_VERSION = 2;
export const ASSESSMENT_SCHEMA_VERSION = 1;
export const SCORING_VERSION = 1;
export const BENCHMARK_COMPATIBILITY_KEY = "operations_foundation_v1";
export const UNFINISHED_ATTEMPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const QUALITATIVE_MAX_LENGTH = 1500;

export type Answer = string | string[];
export type AnswerMap = Record<string, Answer>;

export interface AssessmentQuestion {
  key: string;
  sectionKey: string;
  categoryKey: string;
  promptKey: string;
  helpKey?: string;
  kind: "single" | "multi" | "text";
  required: boolean;
  qualitative: boolean;
  order: number;
  maxSelections?: number;
  maxLength?: number;
  options?: { value: string; labelKey: string }[];
  applicability?: { questionKey: string; operator: "equals" | "not_equals" | "includes"; value: string };
  futureScoreKey?: string;
  futureConfidenceKey?: string;
  futureRoadmapDomains?: string[];
  benchmarkDimensionKey?: string;
  futureAchievementKeys?: string[];
  scoring?: {
    weight: number;
    optionValues: Record<string, number | null>;
    reverseScored?: boolean;
    uncertainValues?: string[];
  };
}

const option = (group: string, value: string) => ({ value, labelKey: `assessment.options.${group}.${value}` });
const options = (group: string, values: string[]) => values.map((value) => option(group, value));

const q = (
  key: string,
  sectionKey: string,
  order: number,
  group: string,
  values: string[],
  metadata: Partial<AssessmentQuestion> = {},
): AssessmentQuestion => ({
  key,
  sectionKey,
  categoryKey: sectionKey,
  promptKey: `assessment.questions.${key}.prompt`,
  kind: "single",
  required: true,
  qualitative: false,
  order,
  options: options(group, values),
  futureScoreKey: key,
  futureConfidenceKey: sectionKey,
  scoring: "futureScoreKey" in metadata && metadata.futureScoreKey === undefined ? undefined : scored(values),
  ...metadata,
});

const teamApplicability = {
  questionKey: "business.team_size",
  operator: "not_equals" as const,
  value: "solo",
};

const scored = (values: string[], metadata: { reverseScored?: boolean; uncertainValues?: string[] } = {}) => ({
  weight: 1,
  optionValues: Object.fromEntries(values.map((value, index) => [value, Math.round(index * 100 / (values.length - 1))])),
  ...metadata,
});

const SECTION_WEIGHTS: Record<string, number> = {
  business: 10,
  scheduling: 18,
  team: 14,
  quality: 18,
  client: 14,
  financial: 16,
  growth: 10,
};

export const INITIAL_ASSESSMENT_DEFINITION = {
  key: ASSESSMENT_KEY,
  definitionVersion: DEFINITION_VERSION,
  schemaVersion: ASSESSMENT_SCHEMA_VERSION,
  scoringVersion: SCORING_VERSION,
  benchmarkCompatibilityKey: BENCHMARK_COMPATIBILITY_KEY,
  status: "published" as const,
  sections: [
    "business", "scheduling", "team", "quality", "client", "financial", "growth", "perspective",
  ].map((key, index) => ({
    key,
    titleKey: `assessment.sections.${key}.title`,
    introKey: `assessment.sections.${key}.intro`,
    order: index + 1,
    scoringWeight: SECTION_WEIGHTS[key],
  })),
  questions: [
    q("business.primary_model", "business", 1, "businessModel", ["residential", "commercial", "str", "mixed"], { benchmarkDimensionKey: "business_model", futureScoreKey: undefined }),
    q("business.service_mix", "business", 2, "serviceMix", ["recurring_residential", "one_time_residential", "commercial_janitorial", "str_turnovers", "specialty", "mixed"], { benchmarkDimensionKey: "service_mix", futureScoreKey: undefined }),
    q("business.team_size", "business", 3, "teamSize", ["solo", "2_4", "5_10", "11_25", "26_plus"], { helpKey: "assessment.questions.business.team_size.help", benchmarkDimensionKey: "team_size_band", futureScoreKey: undefined }),
    q("business.years_operating", "business", 4, "yearsOperating", ["under_1", "1_3", "4_7", "8_plus"], { benchmarkDimensionKey: "years_operating_band", futureScoreKey: undefined }),
    q("business.growth_stage", "business", 5, "growthStage", ["establishing", "stabilizing", "growing", "scaling", "optimizing"], { benchmarkDimensionKey: "growth_stage", scoring: scored(["establishing", "stabilizing", "growing", "scaling", "optimizing"]) }),

    q("scheduling.primary_method", "scheduling", 1, "schedulingMethod", ["memory_messages", "paper", "spreadsheet_calendar", "scheduling_software", "integrated_platform"], { futureRoadmapDomains: ["scheduling_organization"], scoring: scored(["memory_messages", "paper", "spreadsheet_calendar", "scheduling_software", "integrated_platform"]) }),
    q("scheduling.recurring_work", "scheduling", 2, "processMaturity", ["ad_hoc", "partly_documented", "mostly_consistent", "standardized", "automated_visible"], { futureRoadmapDomains: ["scheduling_organization"], scoring: scored(["ad_hoc", "partly_documented", "mostly_consistent", "standardized", "automated_visible"]) }),
    q("scheduling.assignment_clarity", "scheduling", 3, "consistency", ["rarely_clear", "sometimes_clear", "usually_clear", "always_clear"], { futureRoadmapDomains: ["scheduling_organization", "worker_communication"], scoring: scored(["rarely_clear", "sometimes_clear", "usually_clear", "always_clear"]) }),
    q("scheduling.change_handling", "scheduling", 4, "processMaturity", ["ad_hoc", "partly_documented", "mostly_consistent", "standardized", "automated_visible"], { futureRoadmapDomains: ["scheduling_organization", "worker_communication"], scoring: scored(["ad_hoc", "partly_documented", "mostly_consistent", "standardized", "automated_visible"]) }),

    q("team.assignment_delivery", "team", 1, "communicationMethod", ["verbal", "text_threads", "email", "shared_calendar", "workforce_app"], { applicability: teamApplicability, futureRoadmapDomains: ["worker_communication"] }),
    q("team.material_changes", "team", 2, "communicationMethod", ["verbal", "text_threads", "email", "shared_calendar", "workforce_app"], { applicability: teamApplicability, futureRoadmapDomains: ["worker_communication"] }),
    q("team.confirmation", "team", 3, "consistency", ["rarely_clear", "sometimes_clear", "usually_clear", "always_clear"], { applicability: teamApplicability, futureRoadmapDomains: ["worker_communication"] }),
    q("team.instructions_access", "team", 4, "consistency", ["rarely_clear", "sometimes_clear", "usually_clear", "always_clear"], { applicability: teamApplicability, futureRoadmapDomains: ["worker_communication", "operational_foundation"] }),

    q("quality.standard_procedures", "quality", 1, "processMaturity", ["ad_hoc", "partly_documented", "mostly_consistent", "standardized", "automated_visible"], { futureRoadmapDomains: ["quality_assurance"], futureAchievementKeys: ["documented_quality_standards"] }),
    q("quality.verification", "quality", 2, "qualityVerification", ["none", "complaints_only", "spot_checks", "every_job", "documented_evidence"], { futureRoadmapDomains: ["quality_assurance"] }),
    q("quality.issue_handling", "quality", 3, "processMaturity", ["ad_hoc", "partly_documented", "mostly_consistent", "standardized", "automated_visible"], { futureRoadmapDomains: ["quality_assurance"] }),
    q("quality.rework_pattern", "quality", 4, "frequency", ["frequent", "monthly", "occasional", "rare", "tracked_improving"], { futureRoadmapDomains: ["quality_assurance"] }),

    q("client.inquiry_followup", "client", 1, "processMaturity", ["ad_hoc", "partly_documented", "mostly_consistent", "standardized", "automated_visible"], { futureRoadmapDomains: ["client_experience"] }),
    q("client.expectations", "client", 2, "documentation", ["verbal_only", "basic_message", "written_scope", "proposal_agreement", "standardized_workflow"], { futureRoadmapDomains: ["client_experience", "operational_foundation"] }),
    q("client.updates", "client", 3, "consistency", ["rarely_clear", "sometimes_clear", "usually_clear", "always_clear"], { futureRoadmapDomains: ["client_experience"], futureAchievementKeys: ["consistent_client_experience"] }),
    q("client.request_handling", "client", 4, "processMaturity", ["ad_hoc", "partly_documented", "mostly_consistent", "standardized", "automated_visible"], { futureRoadmapDomains: ["client_experience"] }),

    q("financial.pricing", "financial", 1, "processMaturity", ["ad_hoc", "partly_documented", "mostly_consistent", "standardized", "automated_visible"], { futureRoadmapDomains: ["financial_discipline"] }),
    q("financial.invoicing", "financial", 2, "processMaturity", ["ad_hoc", "partly_documented", "mostly_consistent", "standardized", "automated_visible"], { futureRoadmapDomains: ["financial_discipline"] }),
    q("financial.payment_visibility", "financial", 3, "visibility", ["unclear", "manual_check", "usually_current", "real_time"], { futureRoadmapDomains: ["financial_discipline"] }),
    q("financial.job_profitability", "financial", 4, "visibility", ["unclear", "manual_check", "usually_current", "real_time"], { helpKey: "assessment.questions.financial.job_profitability.help", futureRoadmapDomains: ["financial_discipline"] }),

    q("growth.primary_objective", "growth", 1, "growthObjective", ["stability", "more_clients", "larger_contracts", "build_team", "improve_margin", "reduce_owner_load"], { benchmarkDimensionKey: "primary_growth_objective", futureScoreKey: undefined }),
    q("growth.bottleneck", "growth", 2, "bottleneck", ["lead_flow", "scheduling", "hiring_retention", "communication", "quality", "client_admin", "financial_visibility", "owner_capacity"], { benchmarkDimensionKey: "primary_bottleneck", futureScoreKey: undefined }),
    q("growth.capacity", "growth", 3, "capacity", ["significant_room", "some_room", "near_capacity", "over_capacity", "uncertain"], { futureRoadmapDomains: ["automation_scale"], futureScoreKey: undefined }),
    q("growth.fragmentation", "growth", 4, "fragmentation", ["one_system", "two_systems", "several_tools", "mostly_messages_paper", "uncertain"], { benchmarkDimensionKey: "process_fragmentation", futureRoadmapDomains: ["operational_foundation", "automation_scale"], scoring: { weight: 1, optionValues: { one_system: 100, two_systems: 70, several_tools: 35, mostly_messages_paper: 0, uncertain: null }, reverseScored: true, uncertainValues: ["uncertain"] } }),
    q("growth.automation_readiness", "growth", 5, "readiness", ["not_priority", "exploring", "ready_for_one_area", "ready_for_multiple", "already_automating"], { futureRoadmapDomains: ["automation_scale"] }),

    { key: "perspective.pride", sectionKey: "perspective", categoryKey: "perspective", promptKey: "assessment.questions.perspective.pride.prompt", helpKey: "assessment.questions.perspective.pride.help", kind: "text", required: false, qualitative: true, order: 1, maxLength: QUALITATIVE_MAX_LENGTH },
    { key: "perspective.improve", sectionKey: "perspective", categoryKey: "perspective", promptKey: "assessment.questions.perspective.improve.prompt", helpKey: "assessment.questions.perspective.improve.help", kind: "text", required: false, qualitative: true, order: 2, maxLength: QUALITATIVE_MAX_LENGTH },
  ] satisfies AssessmentQuestion[],
  futureMaturityKeys: ["establishing_foundations", "building_consistency", "operating_reliably", "ready_to_scale", "operationally_advanced"],
  futureRoadmapDomainKeys: ["operational_foundation", "scheduling_organization", "worker_communication", "client_experience", "quality_assurance", "financial_discipline", "automation_scale"],
};

export function isApplicable(question: AssessmentQuestion, answers: AnswerMap): boolean {
  const rule = question.applicability;
  if (!rule) return true;
  const answer = answers[rule.questionKey];
  if (answer === undefined) return false;
  if (rule.operator === "includes") return Array.isArray(answer) && answer.includes(rule.value);
  const equals = !Array.isArray(answer) && answer === rule.value;
  return rule.operator === "equals" ? equals : !equals;
}

export function validateDefinition(definition = INITIAL_ASSESSMENT_DEFINITION): string[] {
  const errors: string[] = [];
  const sectionKeys = new Set(definition.sections.map((section) => section.key));
  const questionKeys = new Set<string>();
  for (const question of definition.questions) {
    if (questionKeys.has(question.key)) errors.push(`Duplicate question key: ${question.key}`);
    questionKeys.add(question.key);
    if (!sectionKeys.has(question.sectionKey)) errors.push(`Unknown section: ${question.sectionKey}`);
    if (question.kind === "text" && !question.qualitative) errors.push(`Text question must be qualitative: ${question.key}`);
    if (question.qualitative && question.required) errors.push(`Qualitative question must be optional: ${question.key}`);
    if (question.kind !== "text" && !question.options?.length) errors.push(`Question has no options: ${question.key}`);
    if (question.scoring) {
      if (question.kind !== "single") errors.push(`Only single-choice questions are scoreable: ${question.key}`);
      if (question.scoring.weight <= 0) errors.push(`Scoring weight must be positive: ${question.key}`);
      const optionValues = new Set(question.options?.map((option) => option.value));
      for (const [value, score] of Object.entries(question.scoring.optionValues)) {
        if (!optionValues.has(value)) errors.push(`Scoring references an unknown option: ${question.key}.${value}`);
        if (score !== null && (score < 0 || score > 100)) errors.push(`Scoring value is outside 0-100: ${question.key}.${value}`);
      }
      for (const option of question.options ?? []) {
        if (!(option.value in question.scoring.optionValues)) errors.push(`Option has no scoring value: ${question.key}.${option.value}`);
      }
    }
  }
  for (const question of definition.questions) {
    if (question.applicability && !questionKeys.has(question.applicability.questionKey)) {
      errors.push(`Unknown applicability question: ${question.key}`);
    }
  }
  return errors;
}

export function assertDefinitionMutable(status: string): void {
  if (status === "published") throw new Error("Published assessment definitions are immutable");
}

export function sanitizeQualitativeText(value: string, maxLength = QUALITATIVE_MAX_LENGTH): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}
