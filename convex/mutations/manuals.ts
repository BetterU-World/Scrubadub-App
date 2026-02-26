import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin } from "../lib/auth";

export const seedManuals = mutation({
  args: {
    userId: v.id("users"),
    manuals: v.array(
      v.object({
        title: v.string(),
        description: v.optional(v.string()),
        category: v.union(
          v.literal("cleaner"),
          v.literal("owner"),
          v.literal("app")
        ),
        roleVisibility: v.union(
          v.literal("cleaner"),
          v.literal("owner"),
          v.literal("both")
        ),
        blobKey: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, args.userId);

    let inserted = 0;
    let updated = 0;

    for (const m of args.manuals) {
      const existing = await ctx.db
        .query("manuals")
        .filter((q) => q.eq(q.field("blobKey"), m.blobKey))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          title: m.title,
          description: m.description,
          category: m.category,
          roleVisibility: m.roleVisibility,
        });
        updated++;
      } else {
        await ctx.db.insert("manuals", {
          ...m,
          createdAt: Date.now(),
        });
        inserted++;
      }
    }

    return { inserted, updated };
  },
});
