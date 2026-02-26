import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser } from "../lib/auth";

export const getVisibleManuals = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);

    const allManuals = await ctx.db.query("manuals").collect();

    const visible = allManuals.filter((m) => {
      if (m.roleVisibility === "both") return true;
      if (user.role === "owner") return m.roleVisibility === "owner" || m.roleVisibility === "cleaner";
      // cleaner + maintenance see cleaner-visible manuals
      return m.roleVisibility === "cleaner";
    });

    return visible
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ blobKey: _blobKey, ...rest }) => rest);
  },
});

/** Internal query used by the getManualSignedUrl action. */
export const validateManualAccess = internalQuery({
  args: { userId: v.id("users"), manualId: v.id("manuals") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);
    const manual = await ctx.db.get(args.manualId);
    if (!manual) throw new Error("Manual not found");

    const canAccess =
      manual.roleVisibility === "both" ||
      user.role === "owner" ||
      (manual.roleVisibility === "cleaner" &&
        (user.role === "cleaner" || user.role === "maintenance"));

    if (!canAccess) throw new Error("Access denied");
    return manual;
  },
});
