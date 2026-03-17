import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { getSessionUser, requireSuperAdmin } from "../lib/auth";

export const getVisibleManuals = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.userId);

    const allManuals = await ctx.db.query("manuals").collect();

    const visible = allManuals.filter((m) => {
      if (m.roleVisibility === "both") return true;
      if (user.role === "owner") return m.roleVisibility === "owner" || m.roleVisibility === "cleaner";
      // cleaner + maintenance + manager see cleaner-visible manuals (not owner manuals)
      return m.roleVisibility === "cleaner";
    });

    return visible
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ blobKey: _blobKey, ...rest }) => rest);
  },
});

/** Superadmin-only: export all manuals in seed-ready shape (includes blobKey). */
export const exportManuals = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);
    const all = await ctx.db.query("manuals").collect();
    return all
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ title, description, category, roleVisibility, blobKey }) => ({
        title,
        ...(description ? { description } : {}),
        category,
        roleVisibility,
        blobKey,
      }));
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
        (user.role === "cleaner" || user.role === "maintenance" || user.role === "manager"));

    if (!canAccess) throw new Error("Access denied");
    return manual;
  },
});
