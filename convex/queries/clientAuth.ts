import { query } from "../_generated/server";
import { v } from "convex/values";

export const getCurrentClientUser = query({
  args: { clientUserId: v.optional(v.id("clientUsers")) },
  handler: async (ctx, args) => {
    if (!args.clientUserId) return null;
    const clientUser = await ctx.db.get(args.clientUserId);
    if (!clientUser || clientUser.status !== "active") return null;
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
