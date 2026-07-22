export const REPORT_VERSION = 1;

export const FINDING_RULES = [
  { id: "section_strength_v1", reportVersion: 1, kind: "strength", minScore: 75, maxScore: 100, evidence: "positive", priority: 50, mutualExclusionGroup: "section_assessment", branch: "applicable", roadmapCompatible: true },
  { id: "section_opportunity_v1", reportVersion: 1, kind: "opportunity", minScore: 0, maxScore: 59, evidence: "opportunity", priority: 100, mutualExclusionGroup: "section_assessment", branch: "applicable", roadmapCompatible: true },
] as const;

type Localized = { en: string; es: string };
type SectionResult = {
  sectionKey: string; score: number; applicableWeight: number;
  positiveEvidenceIds: string[]; opportunityEvidenceIds: string[];
  roadmapCompatibilityKeys: string[];
};
export type CompletionForReport = {
  definitionVersion: number; scoringVersion: number; benchmarkCompatibilityKey: string;
  completedAt: number; operationsScore: number; maturityKey: string;
  confidenceKey: "high" | "moderate" | "limited";
  confidenceMetadata: { reasonKeys: string[] };
  sectionResults: SectionResult[];
  branchContext: { soloOperator: boolean; teamSize?: string };
};

const sectionNames: Record<string, Localized> = {
  business: { en: "Your Business", es: "Tu Negocio" }, scheduling: { en: "Scheduling and Organization", es: "Programación y Organización" },
  team: { en: "Team Communication", es: "Comunicación del Equipo" }, quality: { en: "Quality and Consistency", es: "Calidad y Consistencia" },
  client: { en: "Client Experience", es: "Experiencia del Cliente" }, financial: { en: "Financial Visibility", es: "Visibilidad Financiera" },
  growth: { en: "Growth and Operational Goals", es: "Crecimiento y Objetivos Operativos" },
};
const sectionFocus: Record<string, Localized> = {
  business: { en: "the business has a clearly recognized operating stage", es: "el negocio reconoce con claridad su etapa operativa" },
  scheduling: { en: "scheduling and job coordination have dependable structure", es: "la programación y coordinación del trabajo tienen una estructura confiable" },
  team: { en: "work information reaches the team consistently", es: "la información del trabajo llega al equipo de forma consistente" },
  quality: { en: "quality practices support repeatable service", es: "las prácticas de calidad respaldan un servicio repetible" },
  client: { en: "client expectations and requests are handled consistently", es: "las expectativas y solicitudes del cliente se gestionan con consistencia" },
  financial: { en: "financial processes provide useful operational visibility", es: "los procesos financieros ofrecen visibilidad operativa útil" },
  growth: { en: "growth decisions are supported by organized systems", es: "las decisiones de crecimiento están respaldadas por sistemas organizados" },
};

export const SCORE_BANDS = [
  { min: 0, max: 39, key: "priority_opportunity" }, { min: 40, max: 59, key: "developing_consistency" },
  { min: 60, max: 79, key: "generally_reliable" }, { min: 80, max: 100, key: "strong_foundation" },
] as const;

export function scoreBand(score: number) {
  const band = SCORE_BANDS.find((item) => score >= item.min && score <= item.max);
  if (!band) throw new Error("Section score is outside the supported range");
  return band.key;
}

function finding(section: SectionResult, kind: "strength" | "opportunity") {
  const name = sectionNames[section.sectionKey];
  const focus = sectionFocus[section.sectionKey];
  const strength = kind === "strength";
  return {
    id: `${kind}.${section.sectionKey}.v1`, kind, sectionKey: section.sectionKey,
    title: strength ? { en: `${name.en}: Strong Foundation`, es: `${name.es}: Base Sólida` } : { en: `${name.en}: Improvement Opportunity`, es: `${name.es}: Oportunidad de Mejora` },
    observation: strength ? { en: `The responses indicate that ${focus.en}.`, es: `Las respuestas indican que ${focus.es}.` } : { en: `The responses indicate that ${name.en.toLowerCase()} needs more consistent structure.`, es: `Las respuestas indican que ${name.es.toLowerCase()} necesita una estructura más consistente.` },
    whyItMatters: strength ? { en: "This creates a more dependable foundation for daily execution and future growth.", es: "Esto crea una base más confiable para la ejecución diaria y el crecimiento futuro." } : { en: "Greater consistency can reduce avoidable rework, uncertainty, and owner intervention.", es: "Una mayor consistencia puede reducir el retrabajo evitable, la incertidumbre y la intervención del propietario." },
    evidenceReferences: strength ? section.positiveEvidenceIds : section.opportunityEvidenceIds,
    priority: strength ? section.score : 100 - section.score,
    roadmapCompatibilityKeys: section.roadmapCompatibilityKeys,
    readiness: section.score < 40 ? "now" : "next",
  };
}

export function generateReportSnapshot(completion: CompletionForReport, generatedAt: number) {
  const applicable = completion.sectionResults.filter((section) => !(completion.branchContext.soloOperator && section.sectionKey === "team"));
  const strengthRule = FINDING_RULES[0];
  const opportunityRule = FINDING_RULES[1];
  const orderedStrengths = applicable.filter((section) => section.score >= strengthRule.minScore && section.score <= strengthRule.maxScore && section.positiveEvidenceIds.length >= 1)
    .sort((a, b) => b.score - a.score || a.sectionKey.localeCompare(b.sectionKey)).slice(0, completion.confidenceKey === "limited" ? 2 : 4).map((section) => finding(section, "strength"));
  const orderedOpportunities = applicable.filter((section) => section.score >= opportunityRule.minScore && section.score <= opportunityRule.maxScore && section.opportunityEvidenceIds.length >= 1)
    .sort((a, b) => a.score - b.score || a.sectionKey.localeCompare(b.sectionKey)).slice(0, completion.confidenceKey === "limited" ? 2 : 4).map((section) => finding(section, "opportunity"));
  const strongest = [...applicable].sort((a, b) => b.score - a.score || a.sectionKey.localeCompare(b.sectionKey))[0];
  const priority = [...applicable].sort((a, b) => a.score - b.score || a.sectionKey.localeCompare(b.sectionKey))[0];
  const confidenceLead: Record<string, Localized> = {
    high: { en: "The completed responses provide a strong basis for these findings.", es: "Las respuestas completadas ofrecen una base sólida para estos hallazgos." },
    moderate: { en: "The available evidence suggests a useful operational pattern, while some conclusions should remain measured.", es: "La evidencia disponible sugiere un patrón operativo útil, aunque algunas conclusiones deben considerarse con prudencia." },
    limited: { en: "This report is based on limited or uncertain evidence, so it presents fewer and more cautious findings.", es: "Este informe se basa en evidencia limitada o incierta, por lo que presenta menos hallazgos y con mayor cautela." },
  };
  return {
    reportVersion: REPORT_VERSION, generatedAt, definitionVersion: completion.definitionVersion, scoringVersion: completion.scoringVersion,
    operationsScore: completion.operationsScore, maturityKey: completion.maturityKey, confidenceKey: completion.confidenceKey,
    executiveSummary: [confidenceLead[completion.confidenceKey],
      { en: `The strongest current area is ${sectionNames[strongest.sectionKey].en}; the clearest improvement opportunity is ${sectionNames[priority.sectionKey].en}.`, es: `El área actual más sólida es ${sectionNames[strongest.sectionKey].es}; la oportunidad de mejora más clara es ${sectionNames[priority.sectionKey].es}.` },
      { en: "The maturity stage describes how consistently the operation can turn intent into repeatable daily execution.", es: "La etapa de madurez describe con qué consistencia la operación convierte la intención en una ejecución diaria repetible." }],
    scorecard: applicable.map((section) => ({ sectionKey: section.sectionKey, score: section.score, statusKey: scoreBand(section.score), title: sectionNames[section.sectionKey], interpretation: sectionFocus[section.sectionKey], observations: section.score >= 60 ? section.positiveEvidenceIds.length : section.opportunityEvidenceIds.length })),
    strengths: orderedStrengths, opportunities: orderedOpportunities,
    branchContext: completion.branchContext,
    compatibility: { benchmarkKey: completion.benchmarkCompatibilityKey, roadmapDomainKeys: [...new Set(applicable.flatMap((section) => section.roadmapCompatibilityKeys))].sort() },
    roadmap: { status: "reserved", message: { en: "Your Growth Roadmap will organize these findings into a practical sequence of priorities.", es: "Tu Hoja de Ruta de Crecimiento organizará estos hallazgos en una secuencia práctica de prioridades." } },
  };
}
