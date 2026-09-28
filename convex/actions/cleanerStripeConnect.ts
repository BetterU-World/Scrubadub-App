"use node";
import { retireLegacyOutgoing } from "../lib/legacyOutgoingRetirement";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { requireStaffSession } from "../lib/sessions";

/** Retired creation endpoint. Historical completion is handled separately. */
export const createCleanerStripeAccountLink = action({
  args: { userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireStaffSession(ctx, args.sessionToken, args.userId);
    return retireLegacyOutgoing();
  },
});
