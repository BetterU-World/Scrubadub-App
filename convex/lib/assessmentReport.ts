export const REPORT_VERSION = 2;

export const FINDING_RULES = [
  { id: "section_strength_v2", reportVersion: 2, kind: "strength", minScore: 75, maxScore: 100, evidence: "positive", priority: 50, mutualExclusionGroup: "section_assessment", branch: "applicable", roadmapCompatible: true },
  { id: "section_opportunity_v2", reportVersion: 2, kind: "opportunity", minScore: 0, maxScore: 59, evidence: "opportunity", priority: 100, mutualExclusionGroup: "section_assessment", branch: "applicable", roadmapCompatible: true },
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
const opportunityObservation: Record<string, Localized> = {
  business: { en: "The business stage and its immediate operating priorities are not yet fully aligned.", es: "La etapa del negocio y sus prioridades operativas inmediatas aún no están completamente alineadas." },
  scheduling: { en: "Scheduling practices are not yet consistent enough to make every job and change easy to track.", es: "Las prácticas de programación aún no son lo suficientemente consistentes para que cada trabajo y cambio sea fácil de seguir." },
  team: { en: "Job information and changes do not yet reach the team through a consistently reliable process.", es: "La información y los cambios de los trabajos aún no llegan al equipo mediante un proceso consistentemente confiable." },
  quality: { en: "Quality expectations and follow-through are not yet consistent enough to prevent avoidable variation.", es: "Las expectativas de calidad y el seguimiento aún no son lo suficientemente consistentes para prevenir variaciones evitables." },
  client: { en: "Client expectations, requests, and follow-up do not yet move through one dependable process.", es: "Las expectativas, solicitudes y seguimientos de clientes aún no pasan por un proceso confiable." },
  financial: { en: "Important financial information still takes too much effort to assemble or verify.", es: "La información financiera importante todavía requiere demasiado esfuerzo para reunirse o verificarse." },
  growth: { en: "Growth decisions are moving ahead without a consistently visible operating foundation.", es: "Las decisiones de crecimiento avanzan sin una base operativa consistentemente visible." },
};
const opportunityWhy: Record<string, Localized> = {
  business: { en: "Clear priorities keep time and investment focused on the foundation the business needs now.", es: "Las prioridades claras mantienen el tiempo y la inversión enfocados en la base que el negocio necesita ahora." },
  scheduling: { en: "A dependable schedule reduces missed handoffs, last-minute clarification, and owner intervention.", es: "Un horario confiable reduce entregas fallidas, aclaraciones de último minuto e intervención del propietario." },
  team: { en: "Reliable handoffs let people begin work with less uncertainty and fewer preventable interruptions.", es: "Las entregas confiables permiten comenzar el trabajo con menos incertidumbre e interrupciones evitables." },
  quality: { en: "Consistent standards make good service repeatable and turn problems into improvements instead of recurring surprises.", es: "Los estándares consistentes hacen que el buen servicio sea repetible y convierten los problemas en mejoras en lugar de sorpresas recurrentes." },
  client: { en: "A visible client process protects trust and prevents requests or scope changes from being lost.", es: "Un proceso visible para clientes protege la confianza y evita que se pierdan solicitudes o cambios de alcance." },
  financial: { en: "Current financial visibility supports faster pricing, collection, and capacity decisions.", es: "La visibilidad financiera actualizada permite tomar decisiones más rápidas sobre precios, cobros y capacidad." },
  growth: { en: "Growth is easier to absorb when capacity, ownership, and operating signals are clear first.", es: "El crecimiento es más fácil de absorber cuando primero están claras la capacidad, la responsabilidad y las señales operativas." },
};
const strengthWhy: Record<string, Localized> = {
  business: { en: "Preserving this clarity helps future priorities stay grounded as the business changes.", es: "Preservar esta claridad ayuda a mantener las prioridades futuras bien fundamentadas a medida que cambia el negocio." },
  scheduling: { en: "Protecting this structure gives the rest of the operation a reliable rhythm.", es: "Proteger esta estructura da al resto de la operación un ritmo confiable." },
  team: { en: "Maintaining reliable communication protects execution as responsibilities and staffing change.", es: "Mantener una comunicación confiable protege la ejecución cuando cambian las responsabilidades y el personal." },
  quality: { en: "This consistency protects client trust and gives the business a standard it can grow around.", es: "Esta consistencia protege la confianza del cliente y ofrece al negocio un estándar sobre el cual crecer." },
  client: { en: "Preserving this experience supports retention and makes service changes easier to manage.", es: "Preservar esta experiencia favorece la retención y facilita la gestión de cambios en el servicio." },
  financial: { en: "Maintaining this visibility keeps operating decisions connected to financial reality.", es: "Mantener esta visibilidad conecta las decisiones operativas con la realidad financiera." },
  growth: { en: "Protecting this discipline helps expansion remain deliberate instead of reactive.", es: "Proteger esta disciplina ayuda a que la expansión sea deliberada en lugar de reactiva." },
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
    id: `${kind}.${section.sectionKey}.v2`, kind, sectionKey: section.sectionKey,
    title: strength ? { en: `${name.en}: Strong Foundation`, es: `${name.es}: Base Sólida` } : { en: `${name.en}: Improvement Opportunity`, es: `${name.es}: Oportunidad de Mejora` },
    observation: strength ? { en: `Your responses show that ${focus.en}.`, es: `Tus respuestas muestran que ${focus.es}.` } : opportunityObservation[section.sectionKey],
    whyItMatters: strength ? strengthWhy[section.sectionKey] : opportunityWhy[section.sectionKey],
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
  const sameSection = strongest.sectionKey === priority.sectionKey;
  const diagnosisHeadline: Record<string, Localized> = {
    high: sameSection
      ? { en: `${sectionNames[priority.sectionKey].en} is the clearest place to turn a steady foundation into stronger execution.`, es: `${sectionNames[priority.sectionKey].es} es el lugar más claro para convertir una base estable en una ejecución más sólida.` }
      : { en: `${sectionNames[strongest.sectionKey].en} is a strong foundation; ${sectionNames[priority.sectionKey].en} is the clearest next move.`, es: `${sectionNames[strongest.sectionKey].es} es una base sólida; ${sectionNames[priority.sectionKey].es} es el próximo paso más claro.` },
    moderate: sameSection
      ? { en: `Your operation shows a balanced foundation, with ${sectionNames[priority.sectionKey].en} as the most useful next focus.`, es: `Tu operación muestra una base equilibrada, con ${sectionNames[priority.sectionKey].es} como el próximo enfoque más útil.` }
      : { en: `Your operation shows useful strength in ${sectionNames[strongest.sectionKey].en}, while ${sectionNames[priority.sectionKey].en} appears to be the next focus.`, es: `Tu operación muestra una fortaleza útil en ${sectionNames[strongest.sectionKey].es}, mientras que ${sectionNames[priority.sectionKey].es} parece ser el próximo enfoque.` },
    limited: { en: `The available responses point to ${sectionNames[priority.sectionKey].en} as the most useful place to begin.`, es: `Las respuestas disponibles señalan ${sectionNames[priority.sectionKey].es} como el lugar más útil para comenzar.` },
  };
  const operationType = completion.branchContext.soloOperator
    ? { en: "For a solo operation", es: "Para una operación individual" }
    : { en: "For a team-based operation", es: "Para una operación con equipo" };
  return {
    reportVersion: REPORT_VERSION, generatedAt, definitionVersion: completion.definitionVersion, scoringVersion: completion.scoringVersion,
    operationsScore: completion.operationsScore, maturityKey: completion.maturityKey, confidenceKey: completion.confidenceKey,
    executiveDiagnosis: {
      headline: diagnosisHeadline[completion.confidenceKey],
      summary: {
        en: `${operationType.en}, the scorecard points to a practical sequence: protect what is working in ${sectionNames[strongest.sectionKey].en}, then strengthen ${sectionNames[priority.sectionKey].en} before adding more operational complexity.`,
        es: `${operationType.es}, el cuadro de resultados señala una secuencia práctica: protege lo que funciona en ${sectionNames[strongest.sectionKey].es} y luego fortalece ${sectionNames[priority.sectionKey].es} antes de añadir más complejidad operativa.`,
      },
      strongestArea: { sectionKey: strongest.sectionKey, title: sectionNames[strongest.sectionKey], whyPreserve: strengthWhy[strongest.sectionKey] },
      priorityArea: { sectionKey: priority.sectionKey, title: sectionNames[priority.sectionKey], observation: opportunityObservation[priority.sectionKey] },
    },
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
