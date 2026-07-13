import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireOwnerSession } from "../lib/sessionAuth";
import {
  DIAGNOSTIC_SAMPLE_LIMIT,
  diagnoseRelationshipRecords,
  type DiagnosticClassification,
  type DiagnosticEntityType,
} from "../lib/relationshipDiagnostics";

const entityTypes: DiagnosticEntityType[] = [
  "leads", "properties", "walkthroughs", "proposals",
  "serviceAgreements", "commercialAccounts", "jobs", "invoices",
];
const classifications: DiagnosticClassification[] = [
  "healthy", "intentionally_unlinked", "historical_omission", "needs_review",
];

export const getSummary = query({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwnerSession(ctx, args.sessionToken, args.userId);
    const result = await diagnoseRelationshipRecords(ctx, owner.companyId);
    const entities = Object.fromEntries(entityTypes.map((entityType) => {
      const entityFindings = result.findings.filter((finding) => finding.entityType === entityType);
      const counts = Object.fromEntries(classifications.map((classification) => [
        classification,
        entityFindings.filter((finding) => finding.classification === classification).length,
      ]));
      const samples = entityFindings
        .filter((finding) => finding.classification === "historical_omission" || finding.classification === "needs_review")
        .slice(0, DIAGNOSTIC_SAMPLE_LIMIT);
      return [entityType, { counts, samples }];
    }));

    return {
      generatedAt: Date.now(),
      bounded: result.bounded,
      sampleLimit: DIAGNOSTIC_SAMPLE_LIMIT,
      entities,
    };
  },
});
