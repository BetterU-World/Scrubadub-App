import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableScrollRegion } from "@/components/ui/TableScrollRegion";
import { BarChart3, ChevronUp, ChevronDown, Trophy } from "lucide-react";

type SortKey =
  | "averageScore"
  | "totalJobs"
  | "averageTimeMinutes"
  | "consistencyScore"
  | "redFlagCount";

type SortDirection = "asc" | "desc";

function ScoreBadge({ score }: { score: number }) {
  if (score === 0) {
    return <span className="badge bg-gray-100 text-gray-600">--</span>;
  }
  if (score >= 8) {
    return <span className="badge bg-green-100 text-green-800">{score.toFixed(1)}</span>;
  }
  if (score >= 6) {
    return <span className="badge bg-yellow-100 text-yellow-800">{score.toFixed(1)}</span>;
  }
  return <span className="badge bg-red-100 text-red-800">{score.toFixed(1)}</span>;
}

function RankCell({ rank }: { rank: number }) {
  const { t } = useTranslation();
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-yellow-600">
        <Trophy className="w-4 h-4" /> {t("performance.first")}
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-gray-400">
        <Trophy className="w-4 h-4" /> {t("performance.second")}
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-amber-700">
        <Trophy className="w-4 h-4" /> {t("performance.third")}
      </span>
    );
  }
  return <span className="text-gray-500">{rank}</span>;
}

export function PerformancePage() {
  const { user, sessionToken } = useAuth();
  const { t } = useTranslation();
  const leaderboard = useQuery(
    api.queries.performance.getLeaderboard,
    user?.companyId && sessionToken ? { companyId: user.companyId, userId: user._id, sessionToken } : "skip"
  );

  const [sortKey, setSortKey] = useState<SortKey>("averageScore");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const sortedData = useMemo(() => {
    if (!leaderboard) return [];
    return [...leaderboard].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [leaderboard, sortKey, sortDir]);

  if (!user || leaderboard === undefined) return <PageLoader />;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) {
      return <ChevronDown className="w-3.5 h-3.5 text-gray-300" />;
    }
    return sortDir === "desc" ? (
      <ChevronDown className="w-3.5 h-3.5 text-primary-600" />
    ) : (
      <ChevronUp className="w-3.5 h-3.5 text-primary-600" />
    );
  };

  const ariaSort = (column: SortKey) => {
    if (sortKey !== column) return "none" as const;
    return sortDir === "asc" ? ("ascending" as const) : ("descending" as const);
  };

  return (
    <div>
      <PageHeader
        title={t("performance.title")}
        description={t("guidance.owner.performance")}
      />

      {sortedData.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={t("performance.noDataYet")}
          description={t("performance.noDataDesc")}
        />
      ) : (
        <div className="card overflow-hidden">
          <TableScrollRegion label={t("performance.title")}>
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-gray-200">
                  <th scope="col" className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    {t("performance.rank")}
                  </th>
                  <th scope="col" className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    {t("performance.cleanerCol")}
                  </th>
                  <th
                    scope="col"
                    aria-sort={ariaSort("totalJobs")}
                    className="px-4 text-left text-sm font-medium text-gray-500"
                  >
                    <button
                      type="button"
                      className="touch-target gap-1 text-left hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                      onClick={() => handleSort("totalJobs")}
                    >
                      {t("performance.jobsDone")} <SortIcon column="totalJobs" />
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={ariaSort("averageScore")}
                    className="px-4 text-left text-sm font-medium text-gray-500"
                  >
                    <button
                      type="button"
                      className="touch-target gap-1 text-left hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                      onClick={() => handleSort("averageScore")}
                    >
                      {t("performance.avgScore")} <SortIcon column="averageScore" />
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={ariaSort("averageTimeMinutes")}
                    className="px-4 text-left text-sm font-medium text-gray-500"
                  >
                    <button
                      type="button"
                      className="touch-target gap-1 text-left hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                      onClick={() => handleSort("averageTimeMinutes")}
                    >
                      {t("performance.avgTime")} <SortIcon column="averageTimeMinutes" />
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={ariaSort("consistencyScore")}
                    className="px-4 text-left text-sm font-medium text-gray-500"
                  >
                    <button
                      type="button"
                      className="touch-target gap-1 text-left hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                      onClick={() => handleSort("consistencyScore")}
                    >
                      {t("performance.consistency")} <SortIcon column="consistencyScore" />
                    </button>
                  </th>
                  <th
                    scope="col"
                    aria-sort={ariaSort("redFlagCount")}
                    className="px-4 text-left text-sm font-medium text-gray-500"
                  >
                    <button
                      type="button"
                      className="touch-target gap-1 text-left hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                      onClick={() => handleSort("redFlagCount")}
                    >
                      {t("performance.redFlagsCol")} <SortIcon column="redFlagCount" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map((entry, index) => {
                  const rank = index + 1;
                  const rowHighlight =
                    rank === 1
                      ? "bg-yellow-50/50"
                      : rank === 2
                        ? "bg-gray-50/50"
                        : rank === 3
                          ? "bg-amber-50/30"
                          : "";

                  return (
                    <tr
                      key={entry.cleanerId}
                      className={`border-b border-gray-100 last:border-0 ${rowHighlight}`}
                    >
                      <td className="py-3 px-4 text-sm whitespace-nowrap">
                        <RankCell rank={rank} />
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900">
                        {entry.cleanerName}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 whitespace-nowrap">
                        {entry.totalJobs}
                      </td>
                      <td className="py-3 px-4 text-sm whitespace-nowrap">
                        <ScoreBadge score={entry.averageScore} />
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 whitespace-nowrap">
                        {entry.averageTimeMinutes > 0
                          ? t("performance.minSuffix", { count: entry.averageTimeMinutes })
                          : "--"}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 whitespace-nowrap">
                        {entry.totalJobs > 0 ? `${entry.consistencyScore}%` : "--"}
                      </td>
                      <td className="py-3 px-4 text-sm whitespace-nowrap">
                        {entry.redFlagCount > 0 ? (
                          <span className="badge bg-red-100 text-red-800">
                            {entry.redFlagCount}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScrollRegion>
        </div>
      )}
    </div>
  );
}
