import { v } from "convex/values";
import { jobScheduleWindow } from "./jobScheduleModel";
export const clientSchedulingEventKind = v.union(v.literal("service_confirmed"), v.literal("service_rescheduled"), v.literal("service_cancelled"));
export const clientSchedulingEventFields = {
  companyId: v.id("companies"), clientUserId: v.id("clientUsers"), clientRelationshipId: v.id("clientRelationships"),
  requestId: v.id("clientRequests"), jobId: v.id("jobs"), propertyId: v.optional(v.id("properties")), commercialAccountId: v.optional(v.id("commercialAccounts")),
  kind: clientSchedulingEventKind, revision: v.number(), occurredAt: v.number(), timezone: v.string(),
  before: v.optional(jobScheduleWindow), after: jobScheduleWindow,
};
