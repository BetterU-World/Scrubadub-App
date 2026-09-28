import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useAuth, getStaffSessionToken } from "@/hooks/useAuth";
import { DialogShell } from "@/components/ui/DialogShell";
import { FinancialBoundary } from "./FinancialBoundary";
import { RecipientLedger, money, parseMoney } from "./RecipientLedger";
import { compensationError } from "./compensationErrors";

export function PartnerCompensation({
  sharedJobId,
}: {
  sharedJobId: Id<"sharedJobs">;
}) {
  return (
    <FinancialBoundary>
      <TermsContent sharedJobId={sharedJobId} />
    </FinancialBoundary>
  );
}
function TermsContent({ sharedJobId }: { sharedJobId: Id<"sharedJobs"> }) {
  const { user } = useAuth(),
    { t } = useTranslation();
  const auth = user
    ? { userId: user._id, sessionToken: getStaffSessionToken() }
    : null;
  const data = useQuery(
    api.partnerCompensation.detail,
    auth ? { ...auth, sharedJobId } : "skip",
  );
  const propose = useMutation(api.partnerCompensation.propose),
    respond = useMutation(api.partnerCompensation.respond),
    approve = useMutation(api.partnerCompensation.approve);
  const [amount, setAmount] = useState(""),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const [command, setCommand] = useState<{
    kind: "propose" | "accept" | "decline" | "approve";
    termsId?: Id<"outgoingTerms">;
    revision?: number;
    governing?: Id<"outgoingTerms">;
    latest?: number;
    amount?: number;
    sequence?: number;
  } | null>(null);
  if (!user || !auth) return null;
  if (!data) return <p role="status">{t("common.loading")}</p>;
  const payer = user.companyId === data.payerCompanyId,
    owner = user.role === "owner";
  const governing = data.terms.find(
    (term) => term._id === data.governingTermsId,
  );
  const approved = data.terms.some((term) => term.lifecycle === "approved");
  async function submit() {
    if (!command || !auth) return;
    setPending(true);
    setError("");
    try {
      if (command.kind === "propose")
        await propose({
          ...auth,
          sharedJobId,
          amountCents: command.amount!,
          expectedLatestVersion: command.latest!,
        });
      else if (command.kind === "approve")
        await approve({
          ...auth,
          termsId: command.termsId!,
          expectedRevision: command.revision!,
          expectedExecutionSequence: command.sequence!,
        });
      else
        await respond({
          ...auth,
          termsId: command.termsId!,
          expectedRevision: command.revision!,
          accept: command.kind === "accept",
          expectedGoverningTermsId: command.governing,
        });
      setCommand(null);
      setAmount("");
    } catch (e) {
      setError(compensationError(e, t));
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="card space-y-4 min-w-0">
      <h3 className="font-semibold text-lg">
        {t("partnerCompensation.title")}
      </h3>
      <p className="break-words">
        {payer ? data.recipientName : data.payerName}
      </p>
      <p className="text-sm">{t("partnerCompensation.termsHelp")}</p>
      {!data.connected && (
        <p role="status">{t("partnerCompensation.disconnected")}</p>
      )}
      {!governing && (
        <p role="status" className="text-amber-700">
          {t("partnerCompensation.noGoverning")}
        </p>
      )}
      <p className="text-sm">
        {t(
          data.fulfillment
            ? "partnerCompensation.fulfilled"
            : "partnerCompensation.awaitingFulfillment",
        )}
        {data.fulfillment?.approvedAt
          ? ` · ${new Date(data.fulfillment.approvedAt).toLocaleString()}`
          : ""}
      </p>
      {payer && owner && data.connected && !data.workRejected && !approved && (
        <div className="space-y-2">
          <label className="block">
            {t("partnerCompensation.proposedAmount")}
            <input
              className="input-field"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!amount && parseMoney(amount) === null}
            />
          </label>
          {!!amount && parseMoney(amount) === null && (
            <p role="alert">{t("compensation.moneyError")}</p>
          )}
          <button
            className="btn-primary"
            disabled={!(parseMoney(amount) ?? 0)}
            onClick={() => {
              setError("");
              setCommand({
                kind: "propose",
                amount: parseMoney(amount)!,
                latest: data.terms[0]?.version ?? 0,
              });
            }}
          >
            {t("partnerCompensation.propose")}
          </button>
        </div>
      )}
      <h4 className="font-semibold">{t("partnerCompensation.termsHistory")}</h4>
      {data.terms.length === 0 && <p>{t("partnerCompensation.noTerms")}</p>}
      {data.terms.map((term) => (
        <article
          key={term._id}
          className="border rounded-lg p-3 space-y-2 min-w-0"
        >
          <p className="font-medium break-words">
            {t("partnerCompensation.version", { version: term.version })} ·{" "}
            {money(term.lines[0].amountCents)} · USD
          </p>
          <p className="break-words">{term.sourceLabel}</p>
          <p>
            {t(`partnerCompensation.${term.partner?.state ?? "historical"}`)}
            {term._id === data.governingTermsId
              ? ` · ${t("partnerCompensation.governing")}`
              : ""}
          </p>
          <p className="text-sm break-words">
            {t("partnerCompensation.proposedBy")} {term.partner?.proposedByName}{" "}
            · {new Date(term.createdAt).toLocaleString()}
          </p>
          {term.partner?.respondedAt && (
            <p className="text-sm break-words">
              {t("partnerCompensation.respondedBy")}{" "}
              {term.partner.respondedByName} ·{" "}
              {new Date(term.partner.respondedAt).toLocaleString()}
            </p>
          )}
          {term.lifecycle === "approved" && (
            <p>
              {t("partnerCompensation.financiallyApproved")} ·{" "}
              {new Date(term.approvedAt!).toLocaleString()}
            </p>
          )}
          {!payer &&
            owner &&
            data.connected &&
            !data.workRejected &&
            term.partner?.state === "proposed" && (
              <div className="flex flex-wrap gap-2">
                {(["accept", "decline"] as const).map((kind) => (
                  <button
                    key={kind}
                    className="btn-secondary"
                    onClick={() => {
                      setError("");
                      setCommand({
                        kind,
                        termsId: term._id,
                        revision: term.revision,
                        governing: data.governingTermsId,
                        amount: term.lines[0].amountCents,
                      });
                    }}
                  >
                    {t(`partnerCompensation.${kind}`)}
                  </button>
                ))}
              </div>
            )}
          {payer &&
            owner &&
            term._id === data.governingTermsId &&
            term.partner?.state === "accepted" &&
            !approved && (
              <button
                className="btn-primary"
                disabled={!data.fulfillment}
                onClick={() => {
                  setError("");
                  setCommand({
                    kind: "approve",
                    termsId: term._id,
                    revision: term.revision,
                    sequence: data.fulfillment!.sequence,
                    amount: term.lines[0].amountCents,
                  });
                }}
              >
                {t("partnerCompensation.approve")}
              </button>
            )}
        </article>
      ))}
      <Link className="btn-secondary inline-block" href="/owner/payments">
        {t("partnerCompensation.openPayments")}
      </Link>
      {command && (
        <DialogShell
          open
          pending={pending}
          onOpenChange={() => setCommand(null)}
          title={t(`partnerCompensation.${command.kind}`)}
        >
          <div className="space-y-3">
            <p className="break-words">
              {data.payerName} → {data.recipientName}
            </p>
            <p>{money(command.amount ?? 0)} · USD</p>
            {command.termsId && (
              <div className="space-y-2">
                <p className="break-words">
                  {
                    data.terms.find((term) => term._id === command.termsId)
                      ?.sourceLabel
                  }
                </p>
                <p>
                  {t("partnerCompensation.version", {
                    version: data.terms.find(
                      (term) => term._id === command.termsId,
                    )?.version,
                  })}
                </p>
              </div>
            )}
            <p>{t(`partnerCompensation.${command.kind}Confirm`)}</p>
            {command.kind === "accept" && command.governing && (
              <p>
                {t("partnerCompensation.replaceGoverning", {
                  version: governing?.version,
                })}
              </p>
            )}
            {command.kind === "approve" && (
              <>
                <p>
                  {t("partnerCompensation.respondedBy")}{" "}
                  {governing?.partner?.respondedByName} ·{" "}
                  {new Date(
                    governing?.partner?.respondedAt ?? 0,
                  ).toLocaleString()}
                </p>
                <p>
                  {t("partnerCompensation.fulfilled")} ·{" "}
                  {new Date(data.fulfillment?.approvedAt ?? 0).toLocaleString()}
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="text-red-600 break-words">
                {error}
              </p>
            )}
            <button className="btn-primary" disabled={pending} onClick={submit}>
              {t(`partnerCompensation.${command.kind}`)}
            </button>
          </div>
        </DialogShell>
      )}
    </section>
  );
}

export function PartnerPayments() {
  return (
    <FinancialBoundary>
      <PartnerPaymentsContent />
    </FinancialBoundary>
  );
}
function PartnerPaymentsContent() {
  const { user } = useAuth(),
    { t } = useTranslation();
  const [direction, setDirection] = useState<"payable" | "receivable">(
    "payable",
  );
  const [work, setWork] = useState<Id<"sharedJobs"> | null>(null);
  const [partner, setPartner] = useState<{
    payerCompanyId: Id<"companies">;
    recipientCompanyId: Id<"companies">;
    name: string;
  } | null>(null);
  const auth = user
    ? { userId: user._id, sessionToken: getStaffSessionToken(), direction }
    : ("skip" as const);
  const balances = useQuery(api.partnerCompensation.balances, auth);
  const shared = usePaginatedQuery(api.partnerCompensation.listWork, auth, {
    initialNumItems: 25,
  });
  return (
    <section className="space-y-4 min-w-0">
      <h2 className="text-xl font-semibold">
        {t("partnerCompensation.title")}
      </h2>
      <div className="flex flex-wrap gap-2">
        {(["payable", "receivable"] as const).map((d) => (
          <button
            key={d}
            className="btn-secondary"
            aria-pressed={d === direction}
            onClick={() => {
              setDirection(d);
              setPartner(null);
              setWork(null);
            }}
          >
            {t(`partnerCompensation.${d}`)}
          </button>
        ))}
      </div>
      <p className="text-sm">{t("partnerCompensation.termsHelp")}</p>
      {!balances ? (
        <p role="status">{t("common.loading")}</p>
      ) : balances.length === 0 ? (
        <p>{t("compensation.empty")}</p>
      ) : (
        balances.map((b) => (
          <article
            key={`${b.payerCompanyId}:${b.recipientCompanyId}`}
            className="card min-w-0 space-y-2"
          >
            <h3 className="font-semibold break-words">{b.name}</h3>
            <p>
              {t("compensation.approved")}: {money(b.approvedCents)}
            </p>
            <p>
              {t("compensation.recordedPaid")}: {money(b.recordedPaidCents)}
            </p>
            <p>
              {t("compensation.outstanding")}: {money(b.outstandingCents)}
            </p>
            <p>
              {t("compensation.openItems")}: {b.openCount}
            </p>
            {b.oldestApprovedAt && (
              <p>
                {t("compensation.oldest")}:{" "}
                {new Date(b.oldestApprovedAt).toLocaleDateString()}
              </p>
            )}
            <button className="btn-secondary" onClick={() => setPartner(b)}>
              {t("compensation.history")}
            </button>
          </article>
        ))
      )}
      {partner && (
        <div className="space-y-3">
          <h3 className="font-semibold break-words">{partner.name}</h3>
          <button className="btn-secondary" onClick={() => setPartner(null)}>
            {t("common.close")}
          </button>
          <RecipientLedger
            key={`${partner.payerCompanyId}:${partner.recipientCompanyId}`}
            partnerCompanyId={partner.recipientCompanyId}
            payerCompanyId={partner.payerCompanyId}
          />
        </div>
      )}
      <h3 className="font-semibold">{t("partnerCompensation.sharedWork")}</h3>
      <p className="text-sm">{t("partnerCompensation.workHelp")}</p>
      {shared.results.map((s) => (
        <article className="card min-w-0 space-y-2" key={s._id}>
          <p className="break-words">
            {s.counterpartyName} · {s.label}
          </p>
          <button
            className="btn-secondary"
            onClick={() => setWork(work === s._id ? null : s._id)}
          >
            {t("partnerCompensation.reviewTerms")}
          </button>
          {work === s._id && <PartnerCompensation sharedJobId={s._id} />}
        </article>
      ))}
      {shared.status === "CanLoadMore" && (
        <button className="btn-secondary" onClick={() => shared.loadMore(25)}>
          {t("compensation.more")}
        </button>
      )}
    </section>
  );
}
