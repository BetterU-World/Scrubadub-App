import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireVerifiedClientSession } from "../lib/sessionAuth";

const CAP = 500;

async function relatedByRelationshipIds(
  ctx: any,
  table: any,
  index: string,
  companyId: any,
  relationshipIds: Set<string>
) {
  const records = await ctx.db
    .query(table)
    .withIndex(index, (q: any) => q.eq("companyId", companyId))
    .take(CAP);
  return records.filter((record: any) => relationshipIds.has(String(record.clientRelationshipId)));
}

export const getClientHome = query({
  args: { clientUserId: v.id("clientUsers"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const clientUser = await requireVerifiedClientSession(ctx, args.sessionToken, args.clientUserId);

    const relationships = (
      await ctx.db
        .query("clientRelationships")
        .withIndex("by_clientUserId", (q) => q.eq("clientUserId", clientUser._id))
        .take(CAP)
    ).filter((relationship) => relationship.status === "active");

    const companies = await Promise.all(
      relationships.map((relationship) => ctx.db.get(relationship.companyId))
    );
    const companyNameById = new Map(
      companies.filter(Boolean).map((company: any) => [String(company._id), company.name])
    );

    const byCompany = new Map<string, Set<string>>();
    for (const relationship of relationships) {
      const companyKey = String(relationship.companyId);
      const set = byCompany.get(companyKey) ?? new Set<string>();
      set.add(String(relationship._id));
      byCompany.set(companyKey, set);
    }

    const related = {
      properties: [] as any[],
      commercialAccounts: [] as any[],
      jobs: [] as any[],
      invoices: [] as any[],
      proposals: [] as any[],
      serviceAgreements: [] as any[],
    };

    for (const [companyId, relationshipIds] of byCompany.entries()) {
      const [
        properties,
        commercialAccounts,
        jobs,
        invoices,
        proposals,
        serviceAgreements,
      ] = await Promise.all([
        relatedByRelationshipIds(ctx, "properties", "by_companyId", companyId, relationshipIds),
        relatedByRelationshipIds(ctx, "commercialAccounts", "by_companyId", companyId, relationshipIds),
        relatedByRelationshipIds(ctx, "jobs", "by_companyId_scheduledDate", companyId, relationshipIds),
        relatedByRelationshipIds(ctx, "invoices", "by_company", companyId, relationshipIds),
        relatedByRelationshipIds(ctx, "proposals", "by_companyId", companyId, relationshipIds),
        relatedByRelationshipIds(ctx, "serviceAgreements", "by_company", companyId, relationshipIds),
      ]);
      related.properties.push(...properties);
      related.commercialAccounts.push(...commercialAccounts);
      related.jobs.push(...jobs);
      related.invoices.push(...invoices);
      related.proposals.push(...proposals);
      related.serviceAgreements.push(...serviceAgreements);
    }

    const today = new Date().toISOString().slice(0, 10);

    return {
      clientUser: {
        _id: clientUser._id,
        email: clientUser.email,
        displayName: clientUser.displayName,
        phone: clientUser.phone,
      },
      relationships: relationships.map((relationship) => ({
        _id: relationship._id,
        companyId: relationship.companyId,
        companyName: companyNameById.get(String(relationship.companyId)) ?? "Provider",
        displayName: relationship.displayName,
        businessName: relationship.businessName,
        clientType: relationship.clientType,
        status: relationship.status,
      })),
      properties: related.properties.map((property) => ({
        _id: property._id,
        clientRelationshipId: property.clientRelationshipId,
        name: property.name,
        type: property.type,
        address: property.address,
        active: property.active,
      })),
      commercialAccounts: related.commercialAccounts.map((account) => ({
        _id: account._id,
        clientRelationshipId: account.clientRelationshipId,
        clientName: account.clientName,
        serviceAddress: account.serviceAddress,
        serviceFrequency: account.serviceFrequency,
        status: account.status,
      })),
      upcomingJobs: related.jobs
        .filter((job) => job.scheduledDate >= today && !["cancelled", "approved"].includes(job.status))
        .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))
        .map((job) => ({
          _id: job._id,
          clientRelationshipId: job.clientRelationshipId,
          propertyId: job.propertyId,
          commercialAccountId: job.commercialAccountId,
          type: job.type,
          status: job.status,
          scheduledDate: job.scheduledDate,
          startTime: job.startTime,
        })),
      completedJobs: related.jobs
        .filter((job) => job.completedAt || job.status === "approved")
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
        .slice(0, 50)
        .map((job) => ({
          _id: job._id,
          clientRelationshipId: job.clientRelationshipId,
          propertyId: job.propertyId,
          commercialAccountId: job.commercialAccountId,
          type: job.type,
          status: job.status,
          scheduledDate: job.scheduledDate,
          completedAt: job.completedAt,
        })),
      invoices: related.invoices
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((invoice) => ({
          _id: invoice._id,
          clientRelationshipId: invoice.clientRelationshipId,
          invoiceNumber: invoice.invoiceNumber,
          title: invoice.title,
          status: invoice.status,
          billingStartDate: invoice.billingStartDate,
          billingEndDate: invoice.billingEndDate,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          totalCents: invoice.totalCents,
          baseSubtotalCents: invoice.baseSubtotalCents ?? invoice.subtotalCents,
          addOnSubtotalCents: invoice.addOnSubtotalCents ?? 0,
          subtotalCents: invoice.subtotalCents,
          taxCents: invoice.taxCents,
          addOnLineItems: (invoice.addOnLineItems ?? []).map((line: any) => ({
            snapshotId: line.snapshotId,
            name: line.name,
            pricingMethod: line.pricingMethod,
            unitPriceCents: line.unitPriceCents,
            unitLabel: line.unitLabel,
            quantity: line.quantity,
            finalizedPriceCents: line.finalizedPriceCents,
            billingCadence: line.billingCadence,
            lineTotalCents: line.lineTotalCents,
          })),
        })),
      proposals: related.proposals.map((proposal) => ({
        _id: proposal._id,
        clientRelationshipId: proposal.clientRelationshipId,
        title: proposal.title,
        businessName: proposal.businessName,
        propertyAddress: proposal.propertyAddress,
        serviceFrequency: proposal.serviceFrequency,
        monthlyPriceCents: proposal.monthlyPriceCents,
        oneTimePriceCents: proposal.oneTimePriceCents,
        status: proposal.status,
      })),
      serviceAgreements: related.serviceAgreements
        .filter((agreement) => ["sent", "signed", "cancelled"].includes(agreement.status))
        .map((agreement) => ({
          _id: agreement._id,
          clientRelationshipId: agreement.clientRelationshipId,
          title: agreement.title,
          status: agreement.status,
          declinedAt: agreement.declinedAt,
          effectiveStartDate: agreement.effectiveStartDate,
          effectiveEndDate: agreement.effectiveEndDate,
          renewalDate: agreement.renewalDate,
          serviceFrequency: agreement.serviceFrequency,
          contractAmountCents: agreement.contractAmountCents,
        })),
    };
  },
});
