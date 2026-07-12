import type { Id } from "../_generated/dataModel";

export const DIAGNOSTIC_ENTITY_LIMIT = 100;
export const DIAGNOSTIC_SAMPLE_LIMIT = 5;

export type DiagnosticClassification =
  | "healthy"
  | "intentionally_unlinked"
  | "historical_omission"
  | "needs_review";

export type DiagnosticEntityType =
  | "leads"
  | "properties"
  | "walkthroughs"
  | "proposals"
  | "serviceAgreements"
  | "commercialAccounts"
  | "jobs"
  | "invoices";

type Candidate = {
  relationshipId?: Id<"clientRelationships">;
  sourceType: string;
  sourceId: string;
  invalid?: "dangling" | "cross_company" | "foreign_source";
};

export type DiagnosticFinding = {
  entityType: DiagnosticEntityType;
  recordId: string;
  classification: DiagnosticClassification;
  reasonCode: string;
  candidateClientRelationshipId?: Id<"clientRelationships">;
  sourceIds: string[];
  conflictingClientRelationshipIds: Id<"clientRelationships">[];
};

async function candidateFromRecord(
  ctx: { db: any },
  companyId: Id<"companies">,
  sourceType: string,
  record: any
): Promise<Candidate | null> {
  if (!record) return null;
  if (record.companyId !== companyId) {
    return { sourceType, sourceId: String(record._id), invalid: "foreign_source" };
  }
  if (!record.clientRelationshipId) return null;
  const relationship = await ctx.db.get(record.clientRelationshipId);
  if (!relationship) {
    return {
      relationshipId: record.clientRelationshipId,
      sourceType,
      sourceId: String(record._id),
      invalid: "dangling",
    };
  }
  if (relationship.companyId !== companyId) {
    return {
      relationshipId: relationship._id,
      sourceType,
      sourceId: String(record._id),
      invalid: "cross_company",
    };
  }
  return { relationshipId: relationship._id, sourceType, sourceId: String(record._id) };
}

async function sourceById(ctx: { db: any }, id: any) {
  return id ? await ctx.db.get(id) : null;
}

async function classify(
  ctx: { db: any },
  companyId: Id<"companies">,
  entityType: DiagnosticEntityType,
  record: any,
  sources: Array<{ type: string; record: any }>,
  omissionReason: string
): Promise<DiagnosticFinding> {
  const direct = await candidateFromRecord(ctx, companyId, "direct", record);
  const candidates = (
    await Promise.all(sources.map((source) => candidateFromRecord(ctx, companyId, source.type, source.record)))
  ).filter(Boolean) as Candidate[];
  const all = direct ? [direct, ...candidates] : candidates;
  const invalid = all.find((candidate) => candidate.invalid);
  const relationshipIds = [...new Set(all.flatMap((candidate) => candidate.relationshipId ? [candidate.relationshipId] : []))];
  const sourceIds = [...new Set(sources.flatMap((source) => source.record?._id ? [String(source.record._id)] : []))];

  if (invalid || relationshipIds.length > 1) {
    return {
      entityType,
      recordId: String(record._id),
      classification: "needs_review",
      reasonCode: invalid?.invalid === "dangling"
        ? "dangling_client"
        : invalid?.invalid === "cross_company" || invalid?.invalid === "foreign_source"
          ? "cross_company_evidence"
          : "conflicting_clients",
      sourceIds,
      conflictingClientRelationshipIds: relationshipIds,
    };
  }

  if (record.clientRelationshipId) {
    return {
      entityType,
      recordId: String(record._id),
      classification: "healthy",
      reasonCode: "direct_client_valid",
      sourceIds,
      conflictingClientRelationshipIds: [],
    };
  }

  if (relationshipIds.length === 1) {
    return {
      entityType,
      recordId: String(record._id),
      classification: "historical_omission",
      reasonCode: omissionReason,
      candidateClientRelationshipId: relationshipIds[0],
      sourceIds,
      conflictingClientRelationshipIds: [],
    };
  }

  return {
    entityType,
    recordId: String(record._id),
    classification: "intentionally_unlinked",
    reasonCode: "no_canonical_client",
    sourceIds,
    conflictingClientRelationshipIds: [],
  };
}

export async function diagnoseRelationshipRecords(ctx: { db: any }, companyId: Id<"companies">) {
  const bounded = async (table: string, index: string) => {
    const records = await ctx.db.query(table).withIndex(index, (q: any) => q.eq("companyId", companyId)).take(DIAGNOSTIC_ENTITY_LIMIT + 1);
    return { records: records.slice(0, DIAGNOSTIC_ENTITY_LIMIT), bounded: records.length > DIAGNOSTIC_ENTITY_LIMIT };
  };

  const boundedRedFlags = async () => {
    const statuses = ["open", "acknowledged", "in_progress", "resolved", "wont_fix"];
    const groups = await Promise.all(statuses.map((status) =>
      ctx.db.query("redFlags").withIndex("by_companyId_status", (q: any) =>
        q.eq("companyId", companyId).eq("status", status)
      ).take(DIAGNOSTIC_ENTITY_LIMIT + 1)
    ));
    const records = groups.flat();
    return {
      records: records.slice(0, DIAGNOSTIC_ENTITY_LIMIT),
      bounded: records.length > DIAGNOSTIC_ENTITY_LIMIT || groups.some((group) => group.length > DIAGNOSTIC_ENTITY_LIMIT),
    };
  };

  const [leads, properties, walkthroughs, proposals, agreements, accounts, jobs, invoices, redFlags] = await Promise.all([
    bounded("clientRequests", "by_companyId"),
    bounded("properties", "by_companyId"),
    bounded("walkthroughs", "by_company"),
    bounded("proposals", "by_companyId"),
    bounded("serviceAgreements", "by_company"),
    bounded("commercialAccounts", "by_companyId"),
    bounded("jobs", "by_companyId_scheduledDate"),
    bounded("invoices", "by_company"),
    boundedRedFlags(),
  ]);

  const leadByProperty = new Map<string, any[]>();
  for (const lead of leads.records) {
    if (!lead.propertyId) continue;
    const key = String(lead.propertyId);
    leadByProperty.set(key, [...(leadByProperty.get(key) ?? []), lead]);
  }
  const redFlagByMaintenanceJob = new Map<string, any>();
  for (const flag of redFlags.records) {
    if (flag.maintenanceJobId) redFlagByMaintenanceJob.set(String(flag.maintenanceJobId), flag);
  }

  const findings: DiagnosticFinding[] = [];
  for (const lead of leads.records) {
    findings.push(await classify(ctx, companyId, "leads", lead, [], "pipeline_missing_client"));
  }
  for (const property of properties.records) {
    findings.push(await classify(
      ctx, companyId, "properties", property,
      (leadByProperty.get(String(property._id)) ?? []).map((record) => ({ type: "lead", record })),
      "lead_property_missing_client"
    ));
  }
  for (const walkthrough of walkthroughs.records) {
    findings.push(await classify(ctx, companyId, "walkthroughs", walkthrough, [
      { type: "lead", record: await sourceById(ctx, walkthrough.clientRequestId) },
      { type: "proposal", record: await sourceById(ctx, walkthrough.proposalId) },
      { type: "commercialAccount", record: await sourceById(ctx, walkthrough.commercialAccountId) },
    ], "pipeline_missing_client"));
  }
  for (const proposal of proposals.records) {
    findings.push(await classify(ctx, companyId, "proposals", proposal, [
      { type: "lead", record: await sourceById(ctx, proposal.clientRequestId) },
    ], "pipeline_missing_client"));
  }
  for (const agreement of agreements.records) {
    findings.push(await classify(ctx, companyId, "serviceAgreements", agreement, [
      { type: "proposal", record: await sourceById(ctx, agreement.proposalId) },
      { type: "lead", record: await sourceById(ctx, agreement.clientRequestId) },
      { type: "commercialAccount", record: await sourceById(ctx, agreement.commercialAccountId) },
    ], "pipeline_missing_client"));
  }
  for (const account of accounts.records) {
    findings.push(await classify(ctx, companyId, "commercialAccounts", account, [
      { type: "lead", record: await sourceById(ctx, account.clientRequestId ?? account.sourceLeadId) },
      { type: "proposal", record: await sourceById(ctx, account.sourceProposalId) },
      { type: "serviceAgreement", record: await sourceById(ctx, account.serviceAgreementId) },
    ], "pipeline_missing_client"));
  }
  for (const job of jobs.records) {
    const redFlag = redFlagByMaintenanceJob.get(String(job._id));
    const reliableProperty = job.source === "calendar_sync" || redFlag ? await sourceById(ctx, job.propertyId) : null;
    findings.push(await classify(ctx, companyId, "jobs", job, [
      { type: "commercialAccount", record: await sourceById(ctx, job.commercialAccountId) },
      { type: "redFlag", record: redFlag },
      { type: job.source === "calendar_sync" ? "calendarProperty" : "redFlagProperty", record: reliableProperty },
    ], job.source === "calendar_sync" ? "calendar_job_missing_client" : redFlag ? "red_flag_job_missing_client" : "pipeline_missing_client"));
  }
  for (const invoice of invoices.records) {
    findings.push(await classify(ctx, companyId, "invoices", invoice, [
      { type: "commercialAccount", record: await sourceById(ctx, invoice.commercialAccountId) },
    ], "invoice_missing_client"));
  }

  return {
    findings,
    bounded: [leads, properties, walkthroughs, proposals, agreements, accounts, jobs, invoices, redFlags].some((result) => result.bounded),
  };
}
