import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScrollText } from "lucide-react";

export function AuditLogPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const logs = useQuery(
    api.queries.auditLog.list,
    user?.companyId ? { companyId: user.companyId, userId: user._id } : "skip"
  );

  if (!user || logs === undefined) return <PageLoader />;

  return (
    <div>
      <PageHeader title={t("auditLog.title")} description={t("auditLog.description")} />

      {logs.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("auditLog.noActivity")} description={t("auditLog.noActivityDesc")} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">{t("auditLog.time")}</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">{t("auditLog.user")}</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">{t("auditLog.action")}</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 hidden sm:table-cell">{t("auditLog.details")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 px-4 text-sm text-gray-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">{log.userName}</td>
                  <td className="py-3 px-4 text-sm text-gray-700">
                    <span className="badge bg-gray-100 text-gray-700">{log.action.replace(/_/g, " ")}</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500 hidden sm:table-cell">
                    {log.details || `${log.entityType} ${log.entityId.slice(-6)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
