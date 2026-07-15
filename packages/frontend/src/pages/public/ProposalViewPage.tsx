import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "wouter";
import { useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  Building2,
  CheckCircle,
  FileText,
  MapPin,
  MessageSquare,
  XCircle,
} from "lucide-react";

type ProposalPayload = {
  company: {
    companyName: string;
    companyLogoUrl?: string | null;
    companyEmail?: string | null;
    companyPhone?: string | null;
  };
  clientName: string;
  proposal: {
    title: string;
    businessName?: string | null;
    propertyAddress?: string | null;
    requestedDate?: string | null;
    serviceFrequencyLabel?: string | null;
    serviceFrequencyNotes?: string | null;
    scopeOfWork?: string | null;
    notes?: string | null;
    monthlyPriceLabel?: string | null;
    oneTimePriceLabel?: string | null;
    status: "draft" | "sent" | "accepted" | "declined";
    proposalResponseNote?: string | null;
  };
  walkthroughSummary?: {
    squareFootage?: number | null;
    estimatedHours?: number | null;
    serviceFrequencyRecommendation?: string | null;
    proposalNotes?: string | null;
  } | null;
};

function priceSummary(proposal: ProposalPayload["proposal"]) {
  const parts = [
    proposal.monthlyPriceLabel ? `${proposal.monthlyPriceLabel} per month` : null,
    proposal.oneTimePriceLabel ? `${proposal.oneTimePriceLabel} one-time` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" + ") : "Estimate not set";
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-3 rounded-md border border-gray-200 bg-white p-3">
      <div className="mt-0.5 text-gray-400">{icon}</div>
      <div>
        <p className="text-xs font-medium uppercase text-gray-500">{label}</p>
        <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export function ProposalViewPage() {
  const { t } = useTranslation();
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const getProposal = useAction((api as any).proposalDeliveryActions.getProposalByToken);
  const respondToProposal = useAction((api as any).proposalDeliveryActions.respondToProposal);

  const [proposal, setProposal] = useState<ProposalPayload | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const [responding, setResponding] = useState<"accepted" | "declined" | null>(null);
  const [responseError, setResponseError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setProposal(undefined);

    if (!token) {
      setProposal(null);
      return;
    }

    getProposal({ token })
      .then((result: ProposalPayload | null) => {
        if (!cancelled) setProposal(result);
      })
      .catch(() => {
        if (!cancelled) {
          setProposal(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getProposal, token]);

  const handleRespond = async (decision: "accepted" | "declined") => {
    setResponding(decision);
    setResponseError("");
    try {
      const updated = await respondToProposal({
        token,
        decision,
        note: note.trim() || undefined,
      });
      setProposal(updated);
    } catch (err: any) {
      setResponseError(err.message || "Unable to submit response");
    } finally {
      setResponding(null);
    }
  };

  if (proposal === undefined) {
    return (
      <Shell>
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      </Shell>
    );
  }

  if (proposal === null) {
    return (
      <Shell>
        <div className="card py-12 text-center">
          <h1 className="text-xl font-semibold text-gray-900">{t("proposals.linkUnavailable")}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {t("proposals.linkExpired")}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {t("proposals.linkUnavailableHelp")}
          </p>
        </div>
      </Shell>
    );
  }

  const status = proposal.proposal.status;
  const canRespond = status === "sent";
  const walkthrough = proposal.walkthroughSummary;

  return (
    <Shell
      companyName={proposal.company.companyName}
      companyLogoUrl={proposal.company.companyLogoUrl}
    >
      <section className="card space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary-700">Proposal</p>
            <h1 className="mt-2 text-2xl font-semibold text-gray-900">
              {proposal.proposal.title}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Prepared for {proposal.clientName} by {proposal.company.companyName}
            </p>
          </div>
          <StatusPill status={status} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Detail
            icon={<Building2 className="h-4 w-4" />}
            label="Business / property"
            value={proposal.proposal.businessName}
          />
          <Detail
            icon={<MapPin className="h-4 w-4" />}
            label="Address"
            value={proposal.proposal.propertyAddress}
          />
          <Detail
            icon={<FileText className="h-4 w-4" />}
            label="Service frequency"
            value={proposal.proposal.serviceFrequencyLabel}
          />
          <Detail
            icon={<FileText className="h-4 w-4" />}
            label="Estimated value"
            value={priceSummary(proposal.proposal)}
          />
        </div>

        {proposal.proposal.serviceFrequencyNotes && (
          <TextBlock title="Recommended Schedule" value={proposal.proposal.serviceFrequencyNotes} />
        )}

        {proposal.proposal.scopeOfWork && (
          <TextBlock title="Scope Summary" value={proposal.proposal.scopeOfWork} />
        )}

        {proposal.proposal.notes && (
          <TextBlock title="Notes" value={proposal.proposal.notes} />
        )}

        {(walkthrough?.proposalNotes ||
          walkthrough?.serviceFrequencyRecommendation ||
          walkthrough?.estimatedHours ||
          walkthrough?.squareFootage) && (
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Walkthrough Summary
            </p>
            <div className="mt-2 space-y-2 text-sm text-gray-700">
              {(walkthrough.squareFootage ||
                walkthrough.estimatedHours ||
                walkthrough.serviceFrequencyRecommendation) && (
                <p>
                  {[
                    walkthrough.squareFootage
                      ? `${walkthrough.squareFootage.toLocaleString()} sq ft`
                      : null,
                    walkthrough.estimatedHours
                      ? `${walkthrough.estimatedHours} estimated hours`
                      : null,
                    walkthrough.serviceFrequencyRecommendation,
                  ]
                    .filter(Boolean)
                    .join(" - ")}
                </p>
              )}
              {walkthrough.proposalNotes && (
                <p className="whitespace-pre-wrap">{walkthrough.proposalNotes}</p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="card mt-4">
        {status === "accepted" && (
          <Result
            icon={<CheckCircle className="h-6 w-6 text-green-600" />}
            title="Proposal accepted"
            message="Thank you. Your response has been shared with the provider."
          />
        )}
        {status === "declined" && (
          <Result
            icon={<XCircle className="h-6 w-6 text-red-600" />}
            title="Proposal declined"
            message="Your response has been shared with the provider."
          />
        )}
        {!canRespond && status !== "accepted" && status !== "declined" && (
          <Result
            icon={<MessageSquare className="h-6 w-6 text-gray-500" />}
            title="Proposal not ready"
            message="Ask your cleaning provider to send the latest proposal link."
          />
        )}
        {canRespond && (
          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Response note <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                className="input-field mt-1"
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add a short note if helpful..."
              />
            </div>
            {responseError && <p className="text-sm text-red-600">{responseError}</p>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={responding !== null}
                onClick={() => handleRespond("accepted")}
                className="btn-primary flex flex-1 items-center justify-center gap-2"
              >
                {responding === "accepted" && <LoadingSpinner size="sm" />}
                <CheckCircle className="h-4 w-4" />
                Accept Proposal
              </button>
              <button
                type="button"
                disabled={responding !== null}
                onClick={() => handleRespond("declined")}
                className="btn-secondary flex flex-1 items-center justify-center gap-2"
              >
                {responding === "declined" && <LoadingSpinner size="sm" />}
                <XCircle className="h-4 w-4" />
                Decline
              </button>
            </div>
          </form>
        )}
      </section>
    </Shell>
  );
}

function TextBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="border-t border-gray-100 pt-4">
      <p className="text-xs font-semibold uppercase text-gray-500">{title}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{value}</p>
    </div>
  );
}

function Result({
  icon,
  title,
  message,
}: {
  icon: ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
        {icon}
      </div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{message}</p>
    </div>
  );
}

function StatusPill({ status }: { status: ProposalPayload["proposal"]["status"] }) {
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    sent: "bg-blue-100 text-blue-700",
    accepted: "bg-green-100 text-green-700",
    declined: "bg-red-100 text-red-700",
  };
  return (
    <span className={`badge capitalize ${styles[status] ?? styles.draft}`}>
      {status}
    </span>
  );
}

function Shell({
  companyName,
  companyLogoUrl,
  children,
}: {
  companyName?: string;
  companyLogoUrl?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <img
            src={companyLogoUrl || "/logo-icon.png"}
            alt=""
            className="h-9 w-9 rounded-lg object-cover"
          />
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">SCRUB proposal</p>
            <h1 className="text-base font-semibold text-gray-900">
              {companyName || "Cleaning Proposal"}
            </h1>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
