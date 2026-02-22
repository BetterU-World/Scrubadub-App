import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireOwner } from "../lib/helpers";

export const resetCompanyOpsData = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx, args.userId);
    const companyId = owner.companyId;

    let deletedJobs = 0;
    let deletedForms = 0;
    let deletedFormItems = 0;
    let deletedRedFlags = 0;
    let deletedNotifications = 0;
    let deletedAuditLog = 0;
    let deletedSharedJobs = 0;
    let deletedPartnerContacts = 0;
    let deletedOwnerConnections = 0;

    // 1. Jobs + their forms/formItems
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_companyId_scheduledDate", (q) => q.eq("companyId", companyId))
      .collect();

    for (const job of jobs) {
      // Forms for this job
      const forms = await ctx.db
        .query("forms")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .collect();
      for (const form of forms) {
        // FormItems for this form
        const items = await ctx.db
          .query("formItems")
          .withIndex("by_formId", (q) => q.eq("formId", form._id))
          .collect();
        for (const item of items) {
          await ctx.db.delete(item._id);
          deletedFormItems++;
        }
        await ctx.db.delete(form._id);
        deletedForms++;
      }

      // RedFlags for this job
      const flags = await ctx.db
        .query("redFlags")
        .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
        .collect();
      for (const flag of flags) {
        await ctx.db.delete(flag._id);
        deletedRedFlags++;
      }

      await ctx.db.delete(job._id);
      deletedJobs++;
    }

    // 2. Notifications for all company users
    const users = await ctx.db
      .query("users")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .collect();
    for (const u of users) {
      const notifs = await ctx.db
        .query("notifications")
        .withIndex("by_userId_read", (q) => q.eq("userId", u._id))
        .collect();
      for (const n of notifs) {
        await ctx.db.delete(n._id);
        deletedNotifications++;
      }
    }

    // 3. Audit log
    const logs = await ctx.db
      .query("auditLog")
      .withIndex("by_companyId_timestamp", (q) => q.eq("companyId", companyId))
      .collect();
    for (const log of logs) {
      await ctx.db.delete(log._id);
      deletedAuditLog++;
    }

    // 4. Shared jobs (from or to this company)
    const sharedFrom = await ctx.db
      .query("sharedJobs")
      .withIndex("by_fromCompanyId", (q) => q.eq("fromCompanyId", companyId))
      .collect();
    const sharedTo = await ctx.db
      .query("sharedJobs")
      .withIndex("by_toCompanyId", (q) => q.eq("toCompanyId", companyId))
      .collect();
    for (const s of [...sharedFrom, ...sharedTo]) {
      await ctx.db.delete(s._id);
      deletedSharedJobs++;
    }

    // 5. Partner contacts
    const contacts = await ctx.db
      .query("partnerContacts")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .collect();
    for (const c of contacts) {
      await ctx.db.delete(c._id);
      deletedPartnerContacts++;
    }

    // 6. Owner connections (either side)
    const connA = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyAId", (q) => q.eq("companyAId", companyId))
      .collect();
    const connB = await ctx.db
      .query("ownerConnections")
      .withIndex("by_companyBId", (q) => q.eq("companyBId", companyId))
      .collect();
    for (const c of [...connA, ...connB]) {
      await ctx.db.delete(c._id);
      deletedOwnerConnections++;
    }

    return {
      deletedJobs,
      deletedForms,
      deletedFormItems,
      deletedRedFlags,
      deletedNotifications,
      deletedAuditLog,
      deletedSharedJobs,
      deletedPartnerContacts,
      deletedOwnerConnections,
    };
  },
});
