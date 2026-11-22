import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "wouter";
import { useAction } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ProposalContentView, type ProposalContent } from "@/components/ProposalContentView";
import {
  CheckCircle,
  MessageSquare,
  XCircle,
} from "lucide-react";

type ProposalPayload = ProposalContent & {
  legacyBaseOnly?: boolean;
  issueNumber?: number;
  proposal: {
    status: "draft" | "sent" | "accepted" | "declined";
    proposalResponseNote?: string | null;
  };
};

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
      setResponseError("responseError");
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
  const branded = !!proposal.presentation;
  const lng = proposal.presentation?.locale;
  const label = (key: string) => t(`proposals.branded.${key}`, { lng });

  return (
    <Shell
      companyName={proposal.company.companyName}
      companyLogoUrl={proposal.company.companyLogoUrl}
      branded={branded}
      lang={lng}
    >
      <section className={branded ? "space-y-3" : "card space-y-5"}>
        <div className="flex justify-end print:hidden"><StatusPill status={status} lang={lng} /></div>
        {proposal.legacyBaseOnly && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("proposals.v2.legacyPublicHelp")}</p>}
        <ProposalContentView content={proposal} issueNumber={proposal.issueNumber} legacyBaseOnly={proposal.legacyBaseOnly === true} />
      </section>

      <section className={`card mt-4 print:hidden ${branded && canRespond ? "mb-24 sm:mb-0" : ""}`}>
        {status === "accepted" && (
          <Result
            icon={<CheckCircle className="h-6 w-6 text-green-600" />}
            title={label("acceptedTitle")}
            message={label("acceptedMessage")}
          />
        )}
        {status === "declined" && (
          <Result
            icon={<XCircle className="h-6 w-6 text-red-600" />}
            title={label("declinedTitle")}
            message={label("declinedMessage")}
          />
        )}
        {!canRespond && status !== "accepted" && status !== "declined" && (
          <Result
            icon={<MessageSquare className="h-6 w-6 text-gray-500" />}
            title={label("notReadyTitle")}
            message={label("notReadyMessage")}
          />
        )}
        {canRespond && (
          <form className="space-y-4">
            <div>
              <label htmlFor="proposal-response-note" className="block text-sm font-medium text-gray-700">
                {label("responseNote")}
              </label>
              <textarea
                id="proposal-response-note"
                className="input-field mt-1"
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={label("notePlaceholder")}
              />
            </div>
            {responseError && <p role="alert" className="text-sm text-red-600">{label(responseError)}</p>}
            <div className={branded
              ? "fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-slate-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:border-0 sm:p-0"
              : "flex flex-col gap-2 sm:flex-row"}>
              <button
                type="button"
                disabled={responding !== null}
                onClick={() => handleRespond("accepted")}
                className="btn-primary flex min-h-11 flex-[2] items-center justify-center gap-2 text-sm"
              >
                {responding === "accepted" && <LoadingSpinner size="sm" />}
                <CheckCircle className="h-4 w-4" />
                {label("accept")}
              </button>
              <button
                type="button"
                disabled={responding !== null}
                onClick={() => handleRespond("declined")}
                className="btn-secondary flex min-h-11 flex-1 items-center justify-center gap-2 text-sm"
              >
                {responding === "declined" && <LoadingSpinner size="sm" />}
                <XCircle className="h-4 w-4" />
                {label("decline")}
              </button>
            </div>
          </form>
        )}
      </section>
    </Shell>
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

function StatusPill({ status, lang }: { status: ProposalPayload["proposal"]["status"]; lang?: "en" | "es" }) {
  const { t } = useTranslation();
  const styles: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    sent: "bg-blue-100 text-blue-700",
    accepted: "bg-green-100 text-green-700",
    declined: "bg-red-100 text-red-700",
  };
  return (
    <span className={`badge capitalize ${styles[status] ?? styles.draft}`}>
      {t(`proposals.statuses.${status}`, { lng: lang })}
    </span>
  );
}

function Shell({
  companyName,
  companyLogoUrl,
  branded,
  lang,
  children,
}: {
  companyName?: string;
  companyLogoUrl?: string | null;
  branded?: boolean;
  lang?: "en" | "es";
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div lang={lang} className="min-h-screen bg-gray-50">
      {!branded && <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
          <img
            src={companyLogoUrl || "/logo-icon.png"}
            alt=""
            className="h-9 w-9 rounded-lg object-cover"
          />
          <div>
            <p className="text-xs font-medium uppercase text-gray-500">{t("proposals.branded.shellLabel")}</p>
            <h1 className="text-base font-semibold text-gray-900">
              {companyName || t("proposals.branded.offer")}
            </h1>
          </div>
        </div>
      </header>}
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
