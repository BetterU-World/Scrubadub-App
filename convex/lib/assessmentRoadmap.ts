export const ROADMAP_VERSION = 1;
type L = { en: string; es: string };
type Finding = {
  id: string;
  sectionKey: string;
  title: L;
  observation: L;
  whyItMatters: L;
  evidenceReferences: string[];
  roadmapCompatibilityKeys: string[];
};
type Report = {
  reportVersion: number;
  definitionVersion: number;
  scoringVersion: number;
  maturityKey: string;
  confidenceKey: "high" | "moderate" | "limited";
  strengths: Finding[];
  opportunities: Finding[];
  branchContext: { soloOperator: boolean; teamSize?: string };
};

const content: Record<
  string,
  { target: L; actions: L[]; success: L[]; maintain: L; scrub?: L }
> = {
  scheduling: {
    target: {
      en: "Every active job and schedule change is managed from one reliable source of truth.",
      es: "Cada trabajo activo y cambio de horario se gestiona desde una fuente confiable de información.",
    },
    actions: [
      {
        en: "Choose one shared schedule as the authoritative record.",
        es: "Elige un calendario compartido como registro oficial.",
      },
      {
        en: "Record every change in that location before notifying affected people.",
        es: "Registra cada cambio allí antes de avisar a las personas afectadas.",
      },
      {
        en: "Review the next seven days at a consistent time each week.",
        es: "Revisa los próximos siete días en un momento fijo cada semana.",
      },
    ],
    success: [
      {
        en: "All active jobs and changes are visible in one shared schedule.",
        es: "Todos los trabajos activos y cambios son visibles en un calendario compartido.",
      },
    ],
    maintain: {
      en: "Review schedule ownership monthly and prevent side-channel changes from becoming the real record.",
      es: "Revisa mensualmente la responsabilidad del calendario y evita que los cambios por canales alternos se conviertan en el registro real.",
    },
    scrub: {
      en: "SCRUB can support a centralized schedule if you choose to manage this workflow digitally.",
      es: "SCRUB puede apoyar un calendario centralizado si decides gestionar este flujo de forma digital.",
    },
  },
  quality: {
    target: {
      en: "Service standards and quality issues are documented and followed through consistently.",
      es: "Los estándares de servicio y los problemas de calidad se documentan y se atienden de forma consistente.",
    },
    actions: [
      {
        en: "Define the minimum quality standard for repeatable services.",
        es: "Define el estándar mínimo de calidad para los servicios repetibles.",
      },
      {
        en: "Use one simple method to record checks and rework.",
        es: "Usa un método sencillo para registrar revisiones y retrabajos.",
      },
      {
        en: "Review recurring issues and assign a clear follow-up owner.",
        es: "Revisa los problemas recurrentes y asigna una persona responsable del seguimiento.",
      },
    ],
    success: [
      {
        en: "Quality issues are documented and followed through to resolution.",
        es: "Los problemas de calidad se documentan y se atienden hasta su resolución.",
      },
    ],
    maintain: {
      en: "Review quality standards quarterly and after meaningful service changes.",
      es: "Revisa los estándares de calidad trimestralmente y después de cambios importantes en el servicio.",
    },
  },
  financial: {
    target: {
      en: "Revenue, invoices, outstanding balances, and job performance can be reviewed without rebuilding the information manually.",
      es: "Los ingresos, facturas, saldos pendientes y resultados de los trabajos se pueden revisar sin reconstruir la información manualmente.",
    },
    actions: [
      {
        en: "Choose a consistent weekly financial review.",
        es: "Establece una revisión financiera semanal consistente.",
      },
      {
        en: "Track issued invoices and outstanding balances in one place.",
        es: "Registra las facturas emitidas y los saldos pendientes en un solo lugar.",
      },
      {
        en: "Review job-level pricing and cost assumptions regularly.",
        es: "Revisa con regularidad los supuestos de precios y costos por trabajo.",
      },
    ],
    success: [
      {
        en: "Monthly revenue and outstanding balances are available without manual reconstruction.",
        es: "Los ingresos mensuales y saldos pendientes están disponibles sin reconstrucción manual.",
      },
    ],
    maintain: {
      en: "Protect financial visibility by keeping the weekly review and reconciling exceptions promptly.",
      es: "Protege la visibilidad financiera manteniendo la revisión semanal y conciliando las excepciones con rapidez.",
    },
  },
  team: {
    target: {
      en: "Responsibilities, job instructions, and changes are consistently available before work begins.",
      es: "Las responsabilidades, instrucciones y cambios están disponibles de forma consistente antes de iniciar el trabajo.",
    },
    actions: [
      {
        en: "Define who owns each handoff and schedule change.",
        es: "Define quién es responsable de cada entrega y cambio de horario.",
      },
      {
        en: "Use a standard location and format for job instructions.",
        es: "Usa una ubicación y formato estándar para las instrucciones.",
      },
    ],
    success: [
      {
        en: "Job instructions are consistently available before the scheduled start time.",
        es: "Las instrucciones están disponibles de forma consistente antes de la hora programada.",
      },
    ],
    maintain: {
      en: "Check communication consistency whenever workers or responsibilities change.",
      es: "Verifica la consistencia de la comunicación cuando cambien los trabajadores o las responsabilidades.",
    },
  },
  client: {
    target: {
      en: "Client expectations, requests, and changes follow a consistent documented process.",
      es: "Las expectativas, solicitudes y cambios del cliente siguen un proceso documentado y consistente.",
    },
    actions: [
      {
        en: "Define where client requests and scope changes are recorded.",
        es: "Define dónde se registran las solicitudes y cambios de alcance.",
      },
      {
        en: "Assign ownership for acknowledgements and follow-through.",
        es: "Asigna la responsabilidad de confirmar y dar seguimiento.",
      },
    ],
    success: [
      {
        en: "Client changes are recorded in a standard location rather than individual message threads.",
        es: "Los cambios del cliente se registran en una ubicación estándar en lugar de conversaciones individuales.",
      },
    ],
    maintain: {
      en: "Sample recent client changes monthly to confirm the process remains consistent.",
      es: "Revisa mensualmente algunos cambios recientes para confirmar que el proceso siga siendo consistente.",
    },
  },
  growth: {
    target: {
      en: "Growth decisions follow demonstrated capacity, financial visibility, and repeatable operating practices.",
      es: "Las decisiones de crecimiento se basan en capacidad demostrada, visibilidad financiera y prácticas operativas repetibles.",
    },
    actions: [
      {
        en: "Name the operational constraint that must improve before adding volume.",
        es: "Identifica la limitación operativa que debe mejorar antes de aumentar el volumen.",
      },
      {
        en: "Define a small set of readiness signals before expanding.",
        es: "Define un pequeño conjunto de señales de preparación antes de expandirte.",
      },
    ],
    success: [
      {
        en: "Expansion decisions reference clear capacity and operating signals.",
        es: "Las decisiones de expansión se basan en señales claras de capacidad y operación.",
      },
    ],
    maintain: {
      en: "Revisit growth assumptions after material changes in volume, staffing, or margins.",
      es: "Revisa los supuestos de crecimiento después de cambios importantes en volumen, personal o márgenes.",
    },
  },
  business: {
    target: {
      en: "The operating stage and near-term priorities remain explicit as the business changes.",
      es: "La etapa operativa y las prioridades de corto plazo permanecen claras a medida que cambia el negocio.",
    },
    actions: [
      {
        en: "Review the current operating stage each quarter.",
        es: "Revisa la etapa operativa actual cada trimestre.",
      },
    ],
    success: [
      {
        en: "Near-term priorities match the business's current operating stage.",
        es: "Las prioridades de corto plazo corresponden a la etapa operativa actual.",
      },
    ],
    maintain: {
      en: "Reconfirm the operating stage quarterly so priorities do not drift ahead of the foundation.",
      es: "Confirma la etapa operativa cada trimestre para evitar que las prioridades se adelanten a la base existente.",
    },
  },
};
const materiality: Record<string, number> = {
  quality: 100,
  scheduling: 95,
  financial: 90,
  client: 85,
  team: 80,
  growth: 70,
  business: 60,
};
const dependency: Record<string, string | undefined> = {
  quality: "scheduling",
  team: "scheduling",
  growth: "financial",
};
export const ROADMAP_RULES = Object.keys(content).map((sectionKey) => ({
  id: `roadmap.${sectionKey}.v1`,
  roadmapVersion: 1,
  sectionKey,
  priority: materiality[sectionKey],
  dependencyKey: dependency[sectionKey],
  deduplicationKey: sectionKey,
  mutualExclusionGroup: `section.${sectionKey}`,
  branch: sectionKey === "team" ? "team_only" : "applicable",
}));

const measured = (confidence: string, direct: L): L =>
  confidence === "high"
    ? direct
    : {
        en: `The available evidence suggests this priority: ${direct.en}`,
        es: `La evidencia disponible sugiere esta prioridad: ${direct.es}`,
      };
export function generateRoadmapSnapshot(report: Report, generatedAt: number) {
  const allowed = (f: Finding) =>
    !(report.branchContext.soloOperator && f.sectionKey === "team") &&
    content[f.sectionKey];
  const opp = [...report.opportunities]
    .filter(allowed)
    .sort(
      (a, b) =>
        materiality[b.sectionKey] - materiality[a.sectionKey] ||
        a.id.localeCompare(b.id),
    );
  const max = report.confidenceKey === "limited" ? 2 : 6;
  const selected = opp.slice(0, max);
  const selectedSections = new Set(selected.map((x) => x.sectionKey));
  const stages: { now: any[]; next: any[]; later: any[]; maintain: any[] } = {
    now: [],
    next: [],
    later: [],
    maintain: [],
  };
  const advanced = ["ready_to_scale", "operationally_advanced"].includes(
    report.maturityKey,
  );
  const maturityAction: L = advanced
    ? {
        en: "Define a leading indicator and review it with the person responsible for this process.",
        es: "Define un indicador adelantado y revísalo con la persona responsable de este proceso.",
      }
    : {
        en: "Write down the minimum standard and make ownership explicit before adding complexity.",
        es: "Documenta el estándar mínimo y define claramente la responsabilidad antes de añadir complejidad.",
      };
  const make = (f: Finding, stage: string) => {
    const c = content[f.sectionKey];
    const dep =
      dependency[f.sectionKey] &&
      selectedSections.has(dependency[f.sectionKey]!)
        ? dependency[f.sectionKey]
        : undefined;
    return {
      id: `${stage}.${f.sectionKey}.v1`,
      stage,
      relatedFindingIds: [f.id],
      sectionKey: f.sectionKey,
      evidenceReferences: f.evidenceReferences,
      dependencyKeys: dep ? [dep] : [],
      title: f.title,
      currentState: measured(report.confidenceKey, f.observation),
      targetState: c.target,
      whyItMatters: f.whyItMatters,
      recommendedActions: [maturityAction, ...c.actions].slice(0, 4),
      successIndicators: c.success,
      sequencing: dep
        ? {
            en: `Build the ${dep} foundation before advancing this priority.`,
            es: `Establece primero la base de ${dep} antes de avanzar esta prioridad.`,
          }
        : undefined,
      scrubSupport: c.scrub,
    };
  };
  for (const f of selected) {
    const dep = dependency[f.sectionKey];
    let stage =
      stages.now.length < 2 && !dep
        ? "now"
        : stages.next.length < 2
          ? "next"
          : "later";
    if (dep && selectedSections.has(dep)) stage = "next";
    stages[stage as "now"].push(make(f, stage));
  }
  if (report.confidenceKey !== "limited")
    for (const f of report.strengths.filter(allowed).slice(0, 3)) {
      const c = content[f.sectionKey];
      stages.maintain.push({
        ...make(f, "maintain"),
        currentState: f.observation,
        targetState: {
          en: "Preserve this reliable operating practice as the business changes.",
          es: "Preserva esta práctica operativa confiable a medida que cambia el negocio.",
        },
        recommendedActions: [c.maintain],
        successIndicators: c.success,
        dependencyKeys: [],
        sequencing: undefined,
      });
    }
  return {
    roadmapVersion: ROADMAP_VERSION,
    generatedAt,
    reportVersion: report.reportVersion,
    definitionVersion: report.definitionVersion,
    scoringVersion: report.scoringVersion,
    maturityKey: report.maturityKey,
    confidenceKey: report.confidenceKey,
    stageOrder: ["now", "next", "later", "maintain"],
    stages,
    branchContext: report.branchContext,
    audit: {
      selectedFindingIds: selected.map((x) => x.id),
      omittedFindingIds: opp.slice(max).map((x) => x.id),
      ruleVersion: ROADMAP_VERSION,
    },
  };
}
