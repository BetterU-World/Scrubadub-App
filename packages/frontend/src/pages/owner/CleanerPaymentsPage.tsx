import { useState, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth } from "@/hooks/useAuth";
import { toFriendlyMessage } from "@/lib/friendlyError";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageLoader } from "@/components/ui/LoadingSpinner";
import { Link } from "wouter";
import {
  DollarSign,
  ExternalLink,
  CreditCard,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

type Tab = "OPEN" | "PAID";

interface OpenItem {
  _id: string;
  jobId: string;
  status: string;
  cleanerUserId: string;
  cleanerName: string;
  cleanerStripeAccountId: string | null;
  jobLabel: string;
  plannedPayCents: number | null;
  scheduledDate: string;
  isEligible: boolean;
}

interface CleanerGroup {
  cleanerUserId: string;
  cleanerName: string;
  cleanerStripeAccountId: string | null;
  items: OpenItem[];
  totalCents: number;
}

export function CleanerPaymentsPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("OPEN");
  const [batchLoading, setBatchLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readyToPayOnly, setReadyToPayOnly] = useState(true);
  // Local edited amounts keyed by job _id (dollars string)
  const [editedAmounts, setEditedAmounts] = useState<Record<string, string>>({});
  const [savingAmounts, setSavingAmounts] = useState<Record<string, boolean>>({});

  // OPEN tab: source from jobs (shows items even before cleanerPayment exists)
  const unpaidJobs = useQuery(
    api.queries.cleanerPayments.listUnpaidJobsForCompany,
    user?._id && tab === "OPEN" ? { userId: user._id } : "skip",
  );

  // PAID tab: source from cleanerPayments records
  const paidPayments = useQuery(
    api.queries.cleanerPayments.listCleanerPaymentsForCompany,
    user?._id && tab === "PAID" ? { userId: user._id, status: "PAID" as const } : "skip",
  );

  const createBatch = useMutation(api.mutations.cleanerPayments.createCleanerPaymentBatch);
  const markBatchOutside = useMutation(api.mutations.cleanerPayments.markCleanerBatchPaidOutside);
  const createCheckout = useAction(api.actions.cleanerPayments.createCleanerPaymentCheckout);
  const updatePlannedPay = useMutation(api.mutations.jobs.updatePlannedCleanerPay);

  if (!user) return <PageLoader />;

  /** Get the effective planned pay for a job (edited local value or server value) */
  function getEffectiveCents(item: OpenItem): number | null {
    const edited = editedAmounts[item._id];
    if (edited !== undefined) {
      const v = parseFloat(edited);
      return v > 0 ? Math.round(v * 100) : null;
    }
    return item.plannedPayCents;
  }

  // Group unpaid jobs by cleaner
  function groupByCleaner(items: OpenItem[]): CleanerGroup[] {
    const map = new Map<string, CleanerGroup>();
    for (const item of items) {
      const key = item.cleanerUserId;
      if (!map.has(key)) {
        map.set(key, {
          cleanerUserId: key,
          cleanerName: item.cleanerName,
          cleanerStripeAccountId: item.cleanerStripeAccountId,
          items: [],
          totalCents: 0,
        });
      }
      map.get(key)!.items.push(item);
    }
    // Compute totals from effective values
    for (const g of map.values()) {
      g.totalCents = g.items.reduce((sum, item) => {
        const c = getEffectiveCents(item);
        return sum + (c ?? 0);
      }, 0);
    }
    return Array.from(map.values());
  }

  /** Whether every item in the group has a valid amount and is eligible for payout */
  function groupIsPayReady(group: CleanerGroup): boolean {
    return group.items.every((item) => {
      const c = getEffectiveCents(item);
      return c != null && c >= 100 && item.isEligible;
    });
  }

  /** Save an edited planned pay to the server */
  const savePlannedPay = useCallback(
    async (jobId: string, dollars: string) => {
      const cents = Math.round(parseFloat(dollars) * 100);
      if (!cents || cents < 100) return;
      setSavingAmounts((prev) => ({ ...prev, [jobId]: true }));
      try {
        await updatePlannedPay({
          userId: user!._id,
          jobId: jobId as Id<"jobs">,
          amountCents: cents,
        });
      } catch (e: any) {
        setError(e.message ?? "Failed to save amount");
      } finally {
        setSavingAmounts((prev) => ({ ...prev, [jobId]: false }));
      }
    },
    [updatePlannedPay, user],
  );

  async function handleBatchStripe(group: CleanerGroup) {
    setBatchLoading(group.cleanerUserId);
    setError(null);
    try {
      const jobIds = group.items.map((i) => i.jobId as Id<"jobs">);
      const paymentId = await createBatch({
        userId: user!._id,
        jobIds,
        totalAmountCents: group.totalCents,
      });
      const result = await createCheckout({
        userId: user!._id,
        cleanerPaymentId: paymentId,
      });
      if (result?.url) window.location.href = result.url;
    } catch (e: any) {
      console.error("Checkout error:", e);
      setError(toFriendlyMessage(e, "Payment didn\u2019t go through. You weren\u2019t charged."));
    } finally {
      setBatchLoading(null);
    }
  }

  async function handleBatchOutside(group: CleanerGroup) {
    setBatchLoading(group.cleanerUserId);
    setError(null);
    try {
      const jobIds = group.items.map((i) => i.jobId as Id<"jobs">);
      await markBatchOutside({
        userId: user!._id,
        jobIds,
        totalAmountCents: group.totalCents,
      });
    } catch (e: any) {
      setError(toFriendlyMessage(e, "Failed to mark batch paid"));
    } finally {
      setBatchLoading(null);
    }
  }

  const isLoading = tab === "OPEN" ? unpaidJobs === undefined : paidPayments === undefined;
  const filteredUnpaid = unpaidJobs
    ? readyToPayOnly
      ? (unpaidJobs as OpenItem[]).filter((j) => j.isEligible)
      : unpaidJobs
    : undefined;
  const isEmpty = tab === "OPEN"
    ? filteredUnpaid !== undefined && filteredUnpaid.length === 0
    : paidPayments !== undefined && paidPayments.length === 0;

  return (
    <div>
      <PageHeader
        title={t("payments.cleanerPayments")}
        description={t("payments.cleanerPaymentsDesc")}
      />

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6">
          {(["OPEN", "PAID"] as Tab[]).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === tabKey
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tabKey === "OPEN" ? t("payments.open") : t("payments.paid")}
            </button>
          ))}
        </nav>
      </div>

      {tab === "OPEN" && (
        <div className="mb-4 flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={readyToPayOnly}
              onChange={(e) => setReadyToPayOnly(e.target.checked)}
            />
            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
          </label>
          <span className="text-sm text-gray-600">
            {t("payments.showReadyToPayOnly")}
          </span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <PageLoader />
      ) : isEmpty ? (
        <p className="text-sm text-gray-500 py-8 text-center">
          {tab === "OPEN" ? t("payments.noCleanerPaymentsOpen") : t("payments.noCleanerPaymentsPaid")}
        </p>
      ) : tab === "OPEN" && unpaidJobs ? (
        /* ── OPEN tab: grouped by cleaner, sourced from jobs ── */
        <div className="space-y-4">
          {groupByCleaner(
            readyToPayOnly
              ? (unpaidJobs as OpenItem[]).filter((j) => j.isEligible)
              : (unpaidJobs as OpenItem[])
          ).map((group) => {
            const payReady = groupIsPayReady(group);
            const allHaveAmounts = group.items.every((item) => {
              const c = getEffectiveCents(item);
              return c != null && c >= 100;
            });
            const someNotEligible = group.items.some((item) => !item.isEligible);

            return (
              <div key={group.cleanerUserId} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">{group.cleanerName}</p>
                    <p className="text-sm text-gray-500">
                      {t("payments.unpaidJobs", { count: group.items.length })} &middot;{" "}
                      {t("payments.totalOwed", { amount: group.totalCents > 0 ? `$${(group.totalCents / 100).toFixed(2)}` : "—" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    {group.cleanerStripeAccountId && (
                      <button
                        disabled={batchLoading !== null || !payReady}
                        onClick={() => handleBatchStripe(group)}
                        title={
                          !allHaveAmounts
                            ? t("payments.setAmountsFirst")
                            : someNotEligible
                              ? t("payments.jobsMustBeApproved")
                              : undefined
                        }
                        className="btn-primary text-sm px-3 py-1.5 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CreditCard className="w-4 h-4" />
                        {batchLoading === group.cleanerUserId ? t("common.loading") : t("payments.payAllViaApp")}
                      </button>
                    )}
                    <button
                      disabled={batchLoading !== null || !payReady}
                      onClick={() => handleBatchOutside(group)}
                      title={
                        !allHaveAmounts
                          ? t("payments.setAmountsFirst")
                          : someNotEligible
                            ? t("payments.jobsMustBeApproved")
                            : undefined
                      }
                      className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="w-4 h-4" />
                      {batchLoading === group.cleanerUserId ? t("common.saving") : t("payments.markAllPaidOutside")}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {group.items.map((item) => {
                    const hasPlannedPay = item.plannedPayCents != null;
                    const localVal = editedAmounts[item._id];
                    const displayDollars =
                      localVal !== undefined
                        ? localVal
                        : hasPlannedPay
                          ? (item.plannedPayCents! / 100).toFixed(2)
                          : "";
                    const isSaving = savingAmounts[item._id] ?? false;

                    return (
                      <div key={item._id} className="flex items-center justify-between text-sm py-1.5 border-t border-gray-100 gap-2">
                        <div className="flex items-center gap-2 text-gray-600 min-w-0">
                          <Link
                            href={`/jobs/${item.jobId}`}
                            className="hover:text-blue-600 flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> {item.jobLabel}
                          </Link>
                          {!item.isEligible && (
                            <span className="text-xs text-gray-400">({item.status})</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {!hasPlannedPay && localVal === undefined && (
                            <span className="text-amber-600 flex items-center gap-1 text-xs mr-1">
                              <AlertCircle className="w-3 h-3" /> {t("payments.amountNeeded")}
                            </span>
                          )}
                          <span className="text-gray-500">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="1"
                            placeholder="0.00"
                            className="input-field w-24 text-right text-sm py-1 px-2"
                            value={displayDollars}
                            onChange={(e) => {
                              setEditedAmounts((prev) => ({ ...prev, [item._id]: e.target.value }));
                            }}
                            onBlur={() => {
                              const val = editedAmounts[item._id];
                              if (val !== undefined && parseFloat(val) >= 1) {
                                savePlannedPay(item._id, val);
                              }
                            }}
                            disabled={isSaving}
                          />
                          {isSaving && <span className="text-xs text-gray-400">{t("common.saving")}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : paidPayments ? (
        /* ── PAID tab: flat list ── */
        <div className="space-y-3">
          {paidPayments.map((p) => (
            <div
              key={p._id}
              className="card flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-green-50 text-green-600">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {p.cleanerName}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <Link
                      href={`/jobs/${p.jobId}`}
                      className="hover:text-blue-600 flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> {p.jobLabel}
                    </Link>
                    <span>&middot;</span>
                    <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                    {p.paidAt && (
                      <>
                        <span>&middot;</span>
                        <span>{t("payments.paymentDate", { date: new Date(p.paidAt).toLocaleDateString() })}</span>
                      </>
                    )}
                    <span>&middot;</span>
                    <span className="inline-flex items-center gap-1">
                      {p.method === "in_app" ? (
                        <>
                          <CreditCard className="w-3 h-3" />
                          {t("payments.viaScrub")}
                        </>
                      ) : (
                        t("payments.paidOutsideApp")
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-semibold text-gray-900">
                  ${((p.amountCents ?? 0) / 100).toFixed(2)}
                </span>
                <span className="badge bg-green-100 text-green-700">{t("status.paid")}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
