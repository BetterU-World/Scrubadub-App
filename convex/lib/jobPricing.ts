import type { Doc } from "../_generated/dataModel";

export type PriceLine = { snapshotId: string; name: string; amountCents: number; quantity?: number; unitLabel?: string };
export type PriceSnapshot = { baseChargeCents: number; addOns: PriceLine[]; totalCents: number; currency: "usd"; createdAt: number };

export function checkedPriceSnapshot(baseChargeCents: number, addOns: PriceLine[], createdAt = Date.now()): PriceSnapshot {
  if (!Number.isSafeInteger(baseChargeCents) || baseChargeCents < 0 || baseChargeCents > 100_000_000) throw new Error("Invalid base charge");
  if (addOns.length > 20) throw new Error("Too many priced add-ons");
  const ids = new Set<string>();
  let totalCents = baseChargeCents;
  for (const line of addOns) {
    if (!line.snapshotId || ids.has(line.snapshotId) || !line.name.trim() || line.name.length > 120 || !Number.isSafeInteger(line.amountCents) || line.amountCents < 0) throw new Error("Invalid priced add-on");
    if (line.quantity !== undefined && (!Number.isSafeInteger(line.quantity) || line.quantity < 1)) throw new Error("Invalid add-on quantity");
    ids.add(line.snapshotId);
    totalCents += line.amountCents;
    if (!Number.isSafeInteger(totalCents) || totalCents > 100_000_000) throw new Error("Customer charge is too large");
  }
  return { baseChargeCents, addOns, totalCents, currency: "usd", createdAt };
}

export function normalizedJobPrice(job: any) {
  if (job.customerPricingStatus) return job.customerPricingStatus as "pending" | "awaiting_acceptance" | "accepted" | "no_charge";
  return job.customerChargeCents === undefined || job.customerChargeCents === 0 ? "pending" : "legacy_unverified";
}

export async function acceptedOneTimeProposalPrice(ctx: any, proposal: any, request: any, relationshipId: any) {
  if (proposal.companyId !== request.companyId || proposal.clientRequestId !== request._id || proposal.clientRelationshipId !== relationshipId || proposal.status !== "accepted" || !proposal.responseIssueId || (proposal.responseSource !== "client_token" && (!proposal.responseRecordedByUserId || proposal.responseSource !== "owner_reported"))) return null;
  const issue = await ctx.db.get(proposal.responseIssueId) as any;
  if (!issue || issue.companyId !== request.companyId || issue.proposalId !== proposal._id || !issue.issuedAt || issue.withdrawnAt) return null;
  const content = issue.content.proposal;
  if (!content.totals.hasOneTimePricing || content.totals.hasMonthlyPricing || content.totals.hasUnfinalizedStartingAt) return null;
  const addOns = content.addOnLineItems.filter((line: any) => line.billingCadence === "one_time").map((line: any, index: number) => ({ snapshotId: `proposal:${issue._id}:${index}`, name: line.name, amountCents: line.lineTotalCents, quantity: line.quantity ?? undefined, unitLabel: line.unitLabel ?? undefined }));
  if (addOns.some((line: any) => line.amountCents === null)) return null;
  const snapshot = checkedPriceSnapshot(content.totals.baseOneTimePriceCents, addOns);
  if (snapshot.totalCents !== content.totals.oneTimeTotalCents || snapshot.totalCents <= 0) return null;
  return { snapshot, proposalId: proposal._id, issueId: issue._id, consent: { source: proposal.responseSource === "client_token" ? "client_in_app" as const : "owner_reported_outside" as const, acceptedAt: proposal.acceptedAt ?? issue.issuedAt, acceptedAmountCents: snapshot.totalCents, recordedByUserId: proposal.responseRecordedByUserId, proposalIssueId: issue._id } };
}

export async function resolveJobInvoiceablePricing(ctx: any, jobId: any, companyId: any): Promise<any> {
  const job = await ctx.db.get(jobId) as Doc<"jobs"> | null;
  if (!job || job.companyId !== companyId) return { ok: false as const, reason: "wrong_company" as const };
  if (job.commercialAccountId) return { ok: false as const, reason: "commercial_job" as const };
  if (job.status !== "approved") return { ok: false as const, reason: "not_approved" as const };
  const relationship = job.clientRelationshipId ? await ctx.db.get(job.clientRelationshipId) : null;
  if (!relationship || relationship.companyId !== companyId || relationship.status !== "active") return { ok: false as const, reason: "missing_relationship" as const };
  const status = normalizedJobPrice(job);
  if (status === "legacy_unverified") return { ok: false as const, reason: "legacy_unverified" as const };
  if (status === "pending") return { ok: false as const, reason: "price_pending" as const };
  if (status === "awaiting_acceptance") return { ok: false as const, reason: "consent_pending" as const };
  if (status === "no_charge") return { ok: false as const, reason: "no_charge" as const };
  const snapshot = job.customerPricingSnapshot;
  const consent = job.customerPriceConsent;
  if (!snapshot || !consent || !job.customerPricingRevision || !job.customerPricingSource) return { ok: false as const, reason: "invalid_snapshot" as const };
  if (snapshot.addOns.length > 0 && job.customerAddOnsFinalizedRevision !== job.customerPricingRevision) return { ok: false as const, reason: "add_ons_unconfirmed" as const };
  try {
    const calculated = checkedPriceSnapshot(snapshot.baseChargeCents, snapshot.addOns, snapshot.createdAt);
    if (calculated.totalCents <= 0 || calculated.totalCents !== snapshot.totalCents || snapshot.currency !== "usd" || job.customerChargeCents !== snapshot.totalCents || consent.acceptedAmountCents !== snapshot.totalCents) throw new Error("Price mismatch");
    if (job.customerPricingSource === "accepted_proposal") {
      if (!job.customerPriceProposalIssueId || consent.proposalIssueId !== job.customerPriceProposalIssueId) throw new Error("Proposal mismatch");
      const issue = await ctx.db.get(job.customerPriceProposalIssueId);
      if (!issue || issue.companyId !== companyId || issue.proposalId !== job.customerPriceProposalId || !issue.issuedAt || issue.withdrawnAt) throw new Error("Proposal issue mismatch");
    } else {
      if (!job.customerPriceOfferId || consent.offerId !== job.customerPriceOfferId) throw new Error("Offer mismatch");
      const offer = await ctx.db.get(job.customerPriceOfferId);
      if (!offer || offer.companyId !== companyId || offer.clientRelationshipId !== relationship._id || offer.jobId !== jobId || offer.version !== job.customerPricingRevision || offer.status !== "accepted" || offer.snapshot.totalCents !== snapshot.totalCents) throw new Error("Offer version mismatch");
    }
    if (consent.source === "owner_reported_outside" && !consent.recordedByUserId) throw new Error("Outside agreement has no actor");
    if (consent.source === "client_in_app" && job.customerPricingSource !== "accepted_proposal" && !consent.clientUserId) throw new Error("Client agreement has no actor");
  } catch { return { ok: false as const, reason: "invalid_snapshot" as const }; }
  const invoices = await ctx.db.query("invoices").withIndex("by_company", (q: any) => q.eq("companyId", companyId)).collect();
  if (invoices.some((invoice: any) => invoice.status !== "void" && invoice.jobIds.includes(jobId))) return { ok: false as const, reason: "already_invoiced" as const };
  return { ok: true as const, jobId, companyId, clientRelationshipId: relationship._id, pricingRevision: job.customerPricingRevision, currency: "usd" as const, baseChargeCents: snapshot.baseChargeCents, addOns: snapshot.addOns, totalCents: snapshot.totalCents, priceSource: job.customerPricingSource, consent };
}
