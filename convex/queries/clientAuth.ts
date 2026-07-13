import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireVerifiedClientSession } from "../lib/sessionAuth";

export const getCurrentClientUser = query({
  args: { clientUserId: v.optional(v.id("clientUsers")), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const clientUser = await requireVerifiedClientSession(ctx, args.sessionToken, args.clientUserId);
    return {
      _id: clientUser._id,
      email: clientUser.email,
      displayName: clientUser.displayName,
      phone: clientUser.phone,
      language: clientUser.language,
      status: clientUser.status,
    };
  },
});
