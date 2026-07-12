import { useQuery } from "convex/react";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";

const ENTITY_TYPES = [
  "leads", "properties", "walkthroughs", "proposals",
  "serviceAgreements", "commercialAccounts", "jobs", "invoices",
] as const;
const CLASSIFICATIONS = ["healthy", "intentionally_unlinked", "historical_omission", "needs_review"] as const;

function recordHref(entityType: string, recordId: string) {
  if (entityType === "leads") return `/requests/${recordId}`;
  if (entityType === "properties") return `/properties/${recordId}`;
  if (entityType === "commercialAccounts") return `/commercial-accounts/${recordId}`;
  if (entityType === "jobs") return `/jobs/${recordId}`;
  if (entityType === "invoices") return `/commercial-invoices/${recordId}`;
  return null;
}

export function RelationshipDiagnostics({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const diagnostic = useQuery(
    (api as any).queries.relationshipDiagnostics.getSummary,
    { userId }
  ) as any;

  if (diagnostic === undefined) {
    return <div className="card mt-8 h-32 animate-pulse bg-gray-50" />;
  }

  const totals = Object.fromEntries(CLASSIFICATIONS.map((classification) => [
    classification,
    ENTITY_TYPES.reduce((sum, entityType) => sum + (diagnostic.entities[entityType]?.counts[classification] ?? 0), 0),
  ]));
  const actionable = ENTITY_TYPES.flatMap((entityType) =>
    (diagnostic.entities[entityType]?.samples ?? []).map((finding: any) => ({ ...finding, entityType }))
  );
  const clear = totals.historical_omission === 0 && totals.needs_review === 0;

  return (
    <section className="card mt-8" aria-labelledby="relationship-diagnostics-title">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
        <div>
          <h2 id="relationship-diagnostics-title" className="text-lg font-semibold text-gray-900">
            {t("relationshipDiagnostics.title")}
          </h2>
          <p className="mt-1 text-sm text-gray-600">{t("relationshipDiagnostics.explanation")}</p>
          <p className="mt-2 text-xs font-medium text-primary-700">{t("relationshipDiagnostics.readOnlyNotice")}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CLASSIFICATIONS.map((classification) => (
          <div key={classification} className="rounded-lg border border-gray-200 p-3">
            <p className="text-xs font-medium text-gray-500">{t(`relationshipDiagnostics.classifications.${classification}`)}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{totals[classification]}</p>
          </div>
        ))}
      </div>

      {clear ? (
        <div className="mt-5 flex items-start gap-3 rounded-lg bg-green-50 p-4 text-green-800">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">{t("relationshipDiagnostics.emptyState")}</p>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {ENTITY_TYPES.map((entityType) => {
            const findings = actionable.filter((finding) => finding.entityType === entityType);
            if (findings.length === 0) return null;
            return (
              <div key={entityType}>
                <h3 className="text-sm font-semibold text-gray-900">{t(`relationshipDiagnostics.entities.${entityType}`)}</h3>
                <div className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {findings.map((finding: any) => {
                    const href = recordHref(entityType, finding.recordId);
                    const content = (
                      <div className="flex items-start justify-between gap-3 p-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${finding.classification === "historical_omission" ? "text-amber-600" : "text-red-600"}`} />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{t(`relationshipDiagnostics.classifications.${finding.classification}`)}</p>
                            <p className="mt-0.5 text-xs text-gray-600">{t(`relationshipDiagnostics.reasons.${finding.reasonCode}`)}</p>
                          </div>
                        </div>
                        {href && <span className="text-xs font-medium text-primary-600">{t("relationshipDiagnostics.viewRecord")}</span>}
                      </div>
                    );
                    return href ? <Link key={finding.recordId} href={href} className="block hover:bg-gray-50">{content}</Link> : <div key={finding.recordId}>{content}</div>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-5 text-xs text-gray-500">
        {diagnostic.bounded
          ? t("relationshipDiagnostics.boundedNotice")
          : t("relationshipDiagnostics.sampleNotice", { count: diagnostic.sampleLimit })}
      </p>
    </section>
  );
}
