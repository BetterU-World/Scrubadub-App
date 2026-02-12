import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
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
  if (rank === 1) {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-yellow-600">
        <Trophy className="w-4 h-4" /> 1st
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-gray-400">
        <Trophy className="w-4 h-4" /> 2nd
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center gap-1 font-bold text-amber-700">
        <Trophy className="w-4 h-4" /> 3rd
      </span>
    );
  }
  return <span className="text-gray-500">{rank}</span>;
}

export function PerformancePage() {
  const { user } = useAuth();
  const leaderboard = useQuery(
    api.queries.performance.getLeaderboard,
    user?.companyId ? { companyId: user.companyId } : "skip"
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

  return (
    <div>
      <PageHeader
        title="Team Performance"
        description="Cleaner leaderboard and performance metrics"
      />

      {sortedData.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No performance data yet"
          description="Performance metrics will appear here once cleaners complete jobs"
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    Rank
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">
                    Cleaner
                  </th>
                  <th
                    className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    onClick={() => handleSort("totalJobs")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Jobs Done <SortIcon column="totalJobs" />
                    </span>
                  </th>
                  <th
                    className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    onClick={() => handleSort("averageScore")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Avg Score <SortIcon column="averageScore" />
                    </span>
                  </th>
                  <th
                    className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    onClick={() => handleSort("averageTimeMinutes")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Avg Time <SortIcon column="averageTimeMinutes" />
                    </span>
                  </th>
                  <th
                    className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    onClick={() => handleSort("consistencyScore")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Consistency <SortIcon column="consistencyScore" />
                    </span>
                  </th>
                  <th
                    className="text-left py-3 px-4 text-sm font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    onClick={() => handleSort("redFlagCount")}
                  >
                    <span className="inline-flex items-center gap-1">
                      Red Flags <SortIcon column="redFlagCount" />
                    </span>
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
                      <td className="py-3 px-4 text-sm">
                        <RankCell rank={rank} />
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900">
                        {entry.cleanerName}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700">
                        {entry.totalJobs}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <ScoreBadge score={entry.averageScore} />
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700">
                        {entry.averageTimeMinutes > 0
                          ? `${entry.averageTimeMinutes} min`
                          : "--"}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700">
                        {entry.totalJobs > 0 ? `${entry.consistencyScore}%` : "--"}
                      </td>
                      <td className="py-3 px-4 text-sm">
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
          </div>
        </div>
      )}
    </div>
  );
}
