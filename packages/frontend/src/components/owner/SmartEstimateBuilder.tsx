import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTranslation } from "react-i18next";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { calculateEstimate, MissingEstimateInput, validateEstimateHandoff, type EstimateInput } from "../../../../../convex/lib/smartEstimatePricing";
import { calculateProposalTotals, proposalAddOnLineAmount } from "../../../../../convex/lib/proposalAddOnLineItems";
import { DialogShell } from "@/components/ui/DialogShell";
import { EstimateNumber, SmartEstimateFields } from "./SmartEstimateFields";
import { estimateFactScales } from "../../../../../convex/lib/estimatePropertyFacts";

export type EstimateAuth = { userId: Id<"users">; sessionToken: string };
type Workspace = FunctionReturnType<typeof api.queries.smartEstimatePreview.workspace>;
type Profiles = FunctionReturnType<typeof api.queries.smartEstimatePreview.profiles>;
type BuilderProps = {
  auth: EstimateAuth;
  clientRequestId: Id<"clientRequests">;
  walkthroughId?: Id<"walkthroughs">;
  proposalDirty: boolean;
  onClose: () => void;
  onReviewAddOns: () => void;
  onApplied: (updatedAt: number) => void;
};

function feedbackKey(error: unknown) {
  if (error instanceof MissingEstimateInput) return "inputsMissing";
  const message = error instanceof Error ? error.message : "";
  if (message.includes("below-minimum")) return "overrideReasonRequired";
  if (message.includes("monthly base")) return "commercialCadence";
  if (message.includes("one-time pricing only")) return "jobCadence";
  if (message.includes("billing destination")) return "billingDestinationMissing";
  if (message.includes("archived estimate walkthrough") || message.includes("eligible replacement")) return "archivedWalkthrough";
  if (message.includes("Too many priced add-ons")) return "jobLineLimit";
  if (message.includes("job billing constraints")) return "jobAmountLimit";
  if (message.includes("starting-at")) return "unfinishedAddOns";
  if (message.includes("draft changed") || message.includes("approval is stale") || message.includes("add-ons changed")) return "stale";
  return "operationFailed";
}

export function SmartEstimateBuilder(props: BuilderProps) {
  const { t } = useTranslation();
  const workspace = useQuery(api.queries.smartEstimatePreview.workspace, {
    ...props.auth, clientRequestId: props.clientRequestId, walkthroughId: props.walkthroughId,
  });
  const profiles = useQuery(api.queries.smartEstimatePreview.profiles, props.auth);
  if (!workspace || !profiles) return <DialogShell open onOpenChange={open => !open && props.onClose()} title={t("smartEstimates.title")}>
    <p role="status">{t("smartEstimates.loading")}</p>
  </DialogShell>;
  return <BuilderForm workspace={workspace} profiles={profiles} {...props} />;
}

function BuilderForm({ workspace, profiles, auth, clientRequestId, proposalDirty, onClose, onReviewAddOns, onApplied }:
  BuilderProps & { workspace: Workspace; profiles: Profiles }) {
  const { t, i18n } = useTranslation();
  const { draft, approval, propertyType, proposal, facts } = workspace;
  const [input, setInput] = useState<EstimateInput>(() => draft?.input ?? {
    strategy: "flat", cadence: propertyType === "commercial" ? "monthly" : "one_time",
    areaHundredths: facts.areaHundredths?.value, bedrooms: facts.bedrooms?.value, bathHalves: facts.bathHalves?.value,
  });
  const [overrideCents, setOverrideCents] = useState(draft?.override?.baseCents);
  const [reason, setReason] = useState(draft?.override?.reason ?? "");
  const [profileRevisionId, setProfileRevisionId] = useState(draft?.profileRevisionId);
  const [profileName, setProfileName] = useState(draft?.profileName);
  const [draftRevision, setDraftRevision] = useState(draft?.draftRevision);
  const [dirty, setDirty] = useState(!draft);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string>();
  const [status, setStatus] = useState<string>();
  const openDraft = useMutation(api.mutations.smartEstimates.previewOpen);
  const saveDraft = useMutation(api.mutations.smartEstimates.previewSave);
  const replaceWalkthrough = useMutation(api.mutations.smartEstimates.previewReplaceWalkthrough);
  const approve = useMutation(api.mutations.smartEstimates.previewApprove);
  const apply = useMutation(api.mutations.smartEstimates.previewApply);

  const override = overrideCents === undefined ? undefined : { baseCents: overrideCents, reason: reason || undefined };
  const lines = proposal?.lines ?? [];
  let calculation: ReturnType<typeof calculateEstimate> | undefined;
  let recommendation: ReturnType<typeof calculateEstimate> | undefined;
  let pricingError: string | undefined;
  let handoffError: string | undefined;
  try {
    recommendation = calculateEstimate(input, lines);
    calculation = override ? calculateEstimate(input, lines, override) : recommendation;
    validateEstimateHandoff(propertyType, calculation, lines);
  } catch (error) {
    if (calculation) handoffError = feedbackKey(error);
    else pricingError = feedbackKey(error);
  }
  const money = (value: number) => new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD" }).format(value / 100);
  const currentDraft = draft?.draftRevision === draftRevision ? draft : null;
  const editableProposal = proposal?.editable && !proposalDirty ? proposal : null;
  const stale = !!approval && (dirty || approval.stale || !currentDraft);
  const canApprove = !!currentDraft && !dirty && !workspace.propertyChanged && !workspace.walkthroughArchived &&
    !!calculation && (!proposal || !!editableProposal);
  const canApply = !!editableProposal && !!approval && !stale && !!calculation && !handoffError && !workspace.walkthroughArchived;
  const existingTotals = proposal && calculateProposalTotals({ ...proposal, addOnLineItems: lines });

  function markEdited() {
    setDirty(true);
    setStatus(undefined);
    setErrorKey(undefined);
  }

  async function submit(action: "save" | "approve" | "apply" | "replace") {
    if (busy) return;
    setBusy(true);
    setErrorKey(undefined);
    setStatus(undefined);
    try {
      if (action === "save") {
        const values = { ...auth, input, override, profileRevisionId, walkthroughId: workspace.walkthroughId };
        if (draft && draftRevision !== undefined) {
          setDraftRevision(await saveDraft({ ...values, estimateId: draft.id, expectedDraftRevision: draftRevision }));
        } else {
          await openDraft({ ...values, clientRequestId });
          setDraftRevision(1);
        }
        setDirty(false);
        setStatus("saved");
      } else if (action === "replace" && currentDraft && workspace.replacement) {
        setDraftRevision(await replaceWalkthrough({ ...auth, estimateId: currentDraft.id,
          expectedDraftRevision: currentDraft.draftRevision, replacementId: workspace.replacement.id }));
        setStatus("walkthroughReplaced");
      } else if (action === "approve" && canApprove && currentDraft) {
        await approve({ ...auth, estimateId: currentDraft.id, expectedDraftRevision: currentDraft.draftRevision,
          proposal: editableProposal ? { proposalId: editableProposal.id, expectedProposalRevision: editableProposal.updatedAt } : undefined });
        setStatus("approved");
      } else if (action === "apply" && canApply && currentDraft && approval && editableProposal) {
        const updatedAt = await apply({ ...auth, estimateId: currentDraft.id, revisionId: approval.id,
          proposalId: editableProposal.id, expectedProposalRevision: editableProposal.updatedAt });
        onApplied(updatedAt);
      }
    } catch (error) {
      setErrorKey(feedbackKey(error));
    } finally {
      setBusy(false);
    }
  }

  function selectProfile(id: string) {
    const profile = profiles.find(item => item.revisionId === id);
    setProfileRevisionId(profile?.revisionId);
    setProfileName(profile?.name);
    if (profile) setInput(previous => ({
      ...profile.defaults,
      areaHundredths: previous.areaHundredths ?? profile.defaults.areaHundredths,
      bedrooms: previous.bedrooms ?? profile.defaults.bedrooms,
      bathHalves: previous.bathHalves ?? profile.defaults.bathHalves,
      laborMinutes: profile.defaults.laborMinutes ?? previous.laborMinutes,
    }));
    markEdited();
  }

  return <DialogShell open onOpenChange={open => !open && onClose()} title={t("smartEstimates.title")}
    description={workspace.address ? <>{t("smartEstimates.privateHelp")} <span className="mt-1 block break-words">
      {workspace.address} · {t(`smartEstimates.sources.${workspace.addressSource ?? "request"}`)}
    </span></> : t("smartEstimates.privateHelp")}
    className="max-w-2xl" pending={busy} closeOnOutsideClick={false}
    footer={<>
      <button type="button" className="btn-secondary" disabled={busy || !!workspace.replacement || (!dirty && !workspace.propertyChanged)} onClick={() => void submit("save")}>{t("smartEstimates.save")}</button>
      <button type="button" className="btn-secondary" disabled={busy || !canApprove} onClick={() => void submit("approve")}>{t("smartEstimates.approve")}</button>
      <button type="button" className="btn-primary" disabled={busy || !canApply} onClick={() => void submit("apply")}>{t("smartEstimates.apply")}</button>
    </>}>
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      {workspace.replacement && <section className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm">
        <p>{t("smartEstimates.replacementHelp", { title: workspace.replacement.title })}</p>
        <ul className="space-y-1">
          {(Object.keys(estimateFactScales) as Array<keyof typeof estimateFactScales>).map(field => {
            const fact = facts[field];
            if (!fact) return null;
            const scale = estimateFactScales[field];
            return <li key={field}>{t(`smartEstimates.fields.${field}`)} · {t("smartEstimates.prefill", {
              value: new Intl.NumberFormat(i18n.language).format(fact.value / scale),
              source: t(`smartEstimates.sources.${fact.source}`),
            })}</li>;
          })}
        </ul>
        <button type="button" className="btn-secondary" disabled={!currentDraft} onClick={() => void submit("replace")}>
          {t("smartEstimates.replaceWalkthrough")}
        </button>
      </section>}
      <label className="block text-sm font-medium">{t("smartEstimates.profile")}
        <select className="input-field mt-1" value={profileRevisionId ?? ""} onChange={e => selectProfile(e.target.value)}>
          <option value="">{t("smartEstimates.manual")}</option>
          {profileRevisionId && !profiles.some(item => item.revisionId === profileRevisionId) &&
            <option value={profileRevisionId}>{t("smartEstimates.savedProfile", { name: profileName ?? "" })}</option>}
          {profiles.map(profile => <option key={profile.revisionId} value={profile.revisionId}>{profile.name}</option>)}
        </select>
      </label>
      <SmartEstimateFields input={input} facts={facts} onChange={value => { setInput(value); markEdited(); }} />
      <p className="text-xs text-gray-600">{t("smartEstimates.quoteFactsHelp")}</p>
      {input.strategy === "hourly" && workspace.walkthroughLabor && <div className="space-y-1 text-sm">
        <p>{t("smartEstimates.walkthroughLabor", workspace.walkthroughLabor)}</p>
        <button type="button" className="btn-secondary w-full whitespace-normal text-sm sm:w-auto" onClick={() => {
          const { visitHours, cleaners } = workspace.walkthroughLabor!;
          setInput(previous => ({ ...previous, laborMinutes: Math.round(visitHours * cleaners * 60) }));
          markEdited();
        }}>{t("smartEstimates.useWalkthroughLabor")}</button>
      </div>}
      {Object.values(facts).some(Boolean) && <button type="button" className="btn-secondary text-sm" onClick={() => {
        setInput(previous => ({ ...previous, areaHundredths: facts.areaHundredths?.value ?? previous.areaHundredths,
          bedrooms: facts.bedrooms?.value ?? previous.bedrooms, bathHalves: facts.bathHalves?.value ?? previous.bathHalves }));
        markEdited();
      }}>{t("smartEstimates.useFacts")}</button>}
      <div className="grid gap-3 sm:grid-cols-2">
        <EstimateNumber label="smartEstimates.fields.override" scale={100} value={overrideCents}
          onChange={value => { setOverrideCents(value); markEdited(); }} />
        {override && <label className="block text-sm font-medium">{t("smartEstimates.overrideReason")}
          <input className="input-field mt-1" value={reason} maxLength={1000} onChange={e => { setReason(e.target.value); markEdited(); }} />
        </label>}
      </div>
      <section className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
        <h3 className="font-semibold">{t("smartEstimates.breakdown")}</h3>
        {recommendation && <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1">
          <dt>{t("smartEstimates.recommended")}</dt><dd>{money(recommendation.recommendedBaseCents)}</dd>
          {calculation && <>
            {override && <><dt>{t("smartEstimates.overrideBase")}</dt><dd>{money(calculation.approvedBaseCents)}</dd></>}
            <dt>{t("smartEstimates.oneTime")}</dt><dd>{money(calculation.approved.oneTimeTotalCents)}</dd>
            <dt>{t("smartEstimates.monthly")}</dt><dd>{money(calculation.approved.monthlyTotalCents)}</dd>
          </>}
        </dl>}
        {!proposal && <p>{t("smartEstimates.noProposal")}</p>}
        {canApply && calculation && existingTotals && proposal && <div className="space-y-2 border-t border-gray-200 pt-2">
          <h4 className="font-medium">{t("proposals.pricingSource.applyPreview")}</h4>
          <p>{t("proposals.pricingSource.currentOffer", { oneTime: money(existingTotals.oneTimeTotalCents), monthly: money(existingTotals.monthlyTotalCents) })}</p>
          <p>{t("proposals.pricingSource.appliedBase", { amount: money(calculation.approvedBaseCents),
            cadence: t(calculation.cadence === "monthly" ? "smartEstimates.monthly" : "smartEstimates.oneTime") })}</p>
          <p>{t("proposals.pricingSource.keepAddOns")}</p>
        </div>}
        {proposal && <div>
          <h4 className="font-medium">{t("smartEstimates.addOns")}</h4>
          <ul>{lines.map(line => {
            const amount = proposalAddOnLineAmount(line);
            return <li className="break-words" key={line.lineItemId}>{line.name} · {t(line.billingCadence === "monthly" ? "smartEstimates.monthly" : "smartEstimates.oneTime")} · {amount === null ? t("smartEstimates.unfinishedAddOns") : money(amount)}</li>;
          })}</ul>
          {proposal.editable && <button type="button" className="btn-secondary mt-2 text-sm" onClick={onReviewAddOns}>{t("smartEstimates.reviewAddOns")}</button>}
        </div>}
      </section>
      {propertyType === "commercial" && <p className="text-sm text-gray-600">{t("smartEstimates.commercialHelp")}</p>}
      {proposalDirty && <p className="text-sm text-amber-800">{t("smartEstimates.saveProposalFirst")}</p>}
      {status && <p role="status" className="text-sm text-green-800">{t(`smartEstimates.${status}`)}</p>}
      {Array.from(new Set([
        pricingError, handoffError, errorKey, stale ? "stale" : undefined,
        propertyType === null ? "billingDestinationMissing" : undefined,
        workspace.propertyChanged && !workspace.replacement ? "propertyChanged" : undefined,
        workspace.walkthroughArchived && !workspace.replacement ? "archivedWalkthrough" : undefined,
      ].filter(Boolean))).map(key =>
        <p key={key} role="status" className="text-sm text-amber-800">{t(`smartEstimates.${key}`)}</p>)}
    </fieldset>
  </DialogShell>;
}
