import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  securityEventTypeValidator,
  securityMetadataValidator,
  securityOutcomeValidator,
  securityPrincipalTypeValidator,
  writeSecurityEvent,
} from "./lib/securityEvents";

export const record = internalMutation({
  args: {
    eventType: securityEventTypeValidator,
    principalType: v.optional(securityPrincipalTypeValidator),
    staffUserId: v.optional(v.id("users")),
    clientUserId: v.optional(v.id("clientUsers")),
    companyId: v.optional(v.id("companies")),
    outcome: securityOutcomeValidator,
    metadata: v.optional(securityMetadataValidator),
  },
  handler: async (ctx, args) => writeSecurityEvent(ctx, args),
});
