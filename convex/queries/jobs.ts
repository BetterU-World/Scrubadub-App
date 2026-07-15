import { query } from "../_generated/server";
import { v } from "convex/values";
import { hasManagerPermission } from "../lib/auth";
import { requireOwnerManagerCompany, requireVerifiedStaffSession, requireWorkerCompany } from "../lib/sessionAuth";
import { withPerfLog } from "../lib/perfLog";
import { getActiveTeamIdsForUser } from "../lib/teams";

// Hard cap for company-scoped job queries
const JOB_LIST_CAP = 2_000;

export const list = query({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    sessionToken: v.string(),
    status: v.optional(v.string()),
    sort: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await withPerfLog(ctx, "jobs:list", async () => {
      const user = await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);
      if (user.companyId !== args.companyId) throw new Error("Access denied");

      const sort = args.sort || "soonest";

      let jobs;
      if (args.status) {
        jobs = await ctx.db
          .query("jobs")
          .withIndex("by_companyId_status", (q) =>
            q.eq("companyId", args.companyId).eq("status", args.status as any)
          )
          .take(JOB_LIST_CAP);
      } else {
        jobs = await ctx.db
          .query("jobs")
          .withIndex("by_companyId_scheduledDate", (q) =>
            q.eq("companyId", args.companyId)
          )
          .take(JOB_LIST_CAP);
      }

      if (user.role === "cleaner" || user.role === "maintenance") {
        const activeTeamIds = await getActiveTeamIdsForUser(ctx, user._id, args.companyId);
        jobs = jobs.filter(
          (j) =>
            j.cleanerIds.includes(user._id) ||
            (j.assignedTeamId && activeTeamIds.has(j.assignedTeamId))
        );
      } else if (user.role === "manager" && !hasManagerPermission(user, "canSeeAllJobs")) {
        const managerTeamIds = await getActiveTeamIdsForUser(ctx, user._id, args.companyId);
        jobs = jobs.filter(
          (j) =>
            j.assignedManagerId === user._id ||
            (j.assignedTeamId && managerTeamIds.has(j.assignedTeamId))
        );
      }

      // Apply sort — the dataset is already loaded via index scan, so this is
      // a lightweight in-memory sort over a single company's jobs.
      switch (sort) {
        case "created_desc":
          jobs.sort((a, b) => b._creationTime - a._creationTime);
          break;
        case "created_asc":
          jobs.sort((a, b) => a._creationTime - b._creationTime);
          break;
        case "updated_desc": {
          const latest = (j: (typeof jobs)[number]) =>
            Math.max(
              j._creationTime,
              j.completedAt ?? 0,
              j.startedAt ?? 0,
              j.arrivedAt ?? 0,
              j.acceptedAt ?? 0,
              j.deniedAt ?? 0,
            );
          jobs.sort((a, b) => latest(b) - latest(a));
          break;
        }
        // "soonest" (default) — ascending scheduledDate.
        // Without status filter the index already provides this order;
        // with a status filter we need an explicit sort.
        default:
          jobs.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
          break;
      }

      // Batch-resolve properties and users to avoid N+1 lookups
      const propertyIds = [...new Set(jobs.map((j) => j.propertyId).filter(Boolean))];
      const propertyDocs = await Promise.all(propertyIds.map((id) => ctx.db.get(id!)));
      const propertyMap = new Map<string, NonNullable<(typeof propertyDocs)[number]>>();
      for (const p of propertyDocs) {
        if (p) propertyMap.set(p._id, p);
      }

      const userIds = [...new Set(jobs.flatMap((j) => [...j.cleanerIds, j.assignedManagerId].filter(Boolean)))];
      const userDocs = await Promise.all(userIds.map((id) => ctx.db.get(id as any)));
      const userMap = new Map<string, any>();
      for (const u of userDocs) {
        if (u) userMap.set(u._id, u);
      }

      const teamIds = [...new Set(jobs.map((j) => j.assignedTeamId).filter(Boolean))];
      const teamDocs = await Promise.all(teamIds.map((id) => ctx.db.get(id!)));
      const teamMap = new Map<string, any>();
      for (const t of teamDocs) {
        if (t) teamMap.set(t._id, t);
      }

      return Promise.all(
        jobs.map(async (job) => {
          const property = job.propertyId ? propertyMap.get(job.propertyId) ?? null : null;
          const cleaners = job.cleanerIds
            .map((id) => {
              const user = userMap.get(id);
              return user ? { _id: user._id, name: user.name } : null;
            })
            .filter(Boolean);

          // Check outgoing shared-job records for this job
          const sharedRecords = await ctx.db
            .query("sharedJobs")
            .withIndex("by_originalJobId", (q) => q.eq("originalJobId", job._id))
            .collect();
          const outgoing = sharedRecords.filter(
            (s) => s.fromCompanyId === args.companyId
          );
          const hasRejectedShare = outgoing.some((s) => s.status === "rejected");
          // True when the job has been shared to at least one partner (any status)
          const hasActiveShare = outgoing.length > 0;
          const incomingSharedRecord = job.sharedFromJobId
            ? await ctx.db
                .query("sharedJobs")
                .withIndex("by_copiedJobId", (q) => q.eq("copiedJobId", job._id))
                .first()
            : null;
          const partnerResponseStatus =
            incomingSharedRecord?.toCompanyId === args.companyId
              ? incomingSharedRecord.status
              : (["rejected", "pending", "accepted", "in_progress", "completed"] as const)
                  .find((status) => outgoing.some((record) => record.status === status)) ?? null;
          // Derive inspection status for badges
          const inspections = await ctx.db
            .query("managerInspections")
            .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
            .collect();
          let inspectionStatus: "none" | "submitted" | "reinspection_requested" = "none";
          if (inspections.length > 0) {
            inspectionStatus = job.inspectionCycleOpen === true ? "reinspection_requested" : "submitted";
          }

          const assignedManager = job.assignedManagerId
            ? userMap.get(job.assignedManagerId) ?? null
            : null;

          return {
            ...job,
            propertyName: property?.name ?? job.propertySnapshot?.name ?? "Unknown",
            propertyAddress: property?.address ?? job.propertySnapshot?.address ?? "",
            cleaners,
            hasRejectedShare,
            hasActiveShare,
            partnerResponseStatus,
            inspectionStatus,
            assignedManagerName: assignedManager?.name ?? null,
            assignedTeamName: job.assignedTeamId ? teamMap.get(job.assignedTeamId)?.name ?? null : null,
            assignmentType: job.assignedTeamId ? "team" : "individual",
          };
        })
      );
    });
  },
});

export const get = query({
  args: { jobId: v.id("jobs"), userId: v.id("users"), sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    if (job.companyId !== user.companyId) throw new Error("Access denied");

    // Role visibility guards: workers must be directly assigned or active team members;
    // managers without canSeeAllJobs must be assigned manager or active team members.
    if (user.role === "cleaner" || user.role === "maintenance") {
      const workerTeamIds = await getActiveTeamIdsForUser(ctx, user._id, user.companyId);
      if (!job.cleanerIds.includes(user._id) && !(job.assignedTeamId && workerTeamIds.has(job.assignedTeamId))) return null;
    }
    if (user.role === "manager" && !hasManagerPermission(user, "canSeeAllJobs")) {
      const managerTeamIds = await getActiveTeamIdsForUser(ctx, user._id, user.companyId);
      if (job.assignedManagerId !== user._id && !(job.assignedTeamId && managerTeamIds.has(job.assignedTeamId))) return null;
    }

    const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
    const cleaners = await Promise.all(
      job.cleanerIds.map(async (id) => {
        const u = await ctx.db.get(id);
        return u ? { _id: u._id, name: u.name, email: u.email } : null;
      })
    );

    const assignedTeam = job.assignedTeamId ? await ctx.db.get(job.assignedTeamId) : null;
    const teamMemberships = job.assignedTeamId
      ? await ctx.db
          .query("teamMembers")
          .withIndex("by_teamId", (q) => q.eq("teamId", job.assignedTeamId!))
          .filter((q) => q.eq(q.field("active"), true))
          .collect()
      : [];
    const teamUsers = await Promise.all(teamMemberships.map((m) => ctx.db.get(m.userId)));
    const assignedTeamMembers = teamMemberships.map((m, idx) => {
      const u = teamUsers[idx];
      return u ? { _id: u._id, name: u.name, email: u.email, role: m.role, userRole: u.role } : null;
    }).filter(Boolean);

    const form = await ctx.db
      .query("forms")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    const redFlags = await ctx.db
      .query("redFlags")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .collect();

    // Resolve photo URLs for form photos so the owner can display them
    let photoUrls: string[] = [];
    if (form?.photoStorageIds && form.photoStorageIds.length > 0) {
      const urls = await Promise.all(
        form.photoStorageIds.map((id) => ctx.storage.getUrl(id))
      );
      photoUrls = urls.filter((u): u is string => u !== null);
    }

    // Resolve assigned manager name
    const assignedManager = job.assignedManagerId
      ? await ctx.db.get(job.assignedManagerId)
      : null;

    return {
      ...job,
      property: property ?? null,
      cleaners: cleaners.filter(Boolean),
      form: form ? { ...form, photoUrls } : null,
      redFlags,
      assignedManagerName: assignedManager?.name ?? null,
      assignedTeamName: assignedTeam?.name ?? null,
      assignedTeam: assignedTeam ? { _id: assignedTeam._id, name: assignedTeam.name, active: assignedTeam.active } : null,
      assignedTeamMembers,
      assignmentType: job.assignedTeamId ? "team" : "individual",
    };
  },
});

export const getForCleaner = query({
  args: {
    cleanerId: v.id("users"),
    companyId: v.id("companies"),
    userId: v.id("users"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await withPerfLog(ctx, "jobs:getForCleaner", async () => {
      const user = await requireWorkerCompany(ctx, args.sessionToken, args.companyId, args.userId);
      if ((user.role === "cleaner" || user.role === "maintenance") && user._id !== args.cleanerId) {
        throw new Error("Access denied");
      }

      const jobs = await ctx.db
        .query("jobs")
        .withIndex("by_companyId_scheduledDate", (q) =>
          q.eq("companyId", args.companyId)
        )
        .take(JOB_LIST_CAP);

      const activeTeamIds = await getActiveTeamIdsForUser(ctx, args.cleanerId, args.companyId);
      const myJobs = jobs.filter(
        (j) =>
          j.status !== "cancelled" &&
          (j.cleanerIds.includes(args.cleanerId) ||
            (j.assignedTeamId && activeTeamIds.has(j.assignedTeamId)))
      );

      return Promise.all(
        myJobs.map(async (job) => {
          const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
          const team = job.assignedTeamId ? await ctx.db.get(job.assignedTeamId) : null;
          return {
            ...job,
            propertyName: property?.name ?? job.propertySnapshot?.name ?? "Unknown",
            propertyAddress: property?.address ?? job.propertySnapshot?.address ?? "",
            assignedTeamName: team?.name ?? null,
            assignmentType: job.assignedTeamId ? "team" : "individual",
          };
        })
      );
    });
  },
});

export const getForManager = query({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await withPerfLog(ctx, "jobs:getForManager", async () => {
      const user = await requireOwnerManagerCompany(ctx, args.sessionToken, args.companyId, args.userId);
      if (user.role !== "manager") throw new Error("Manager access required");

      const allJobs = await ctx.db
        .query("jobs")
        .withIndex("by_companyId_scheduledDate", (q) =>
          q.eq("companyId", args.companyId)
        )
        .take(JOB_LIST_CAP);

      // Manager visibility: all jobs if canSeeAllJobs, otherwise only assigned
      const canSeeAll = hasManagerPermission(user, "canSeeAllJobs");
      const managerTeamIds = canSeeAll ? new Set() : await getActiveTeamIdsForUser(ctx, user._id, args.companyId);
      const visibleJobs = canSeeAll
        ? allJobs.filter((j) => j.status !== "cancelled")
        : allJobs.filter(
            (j) =>
              j.status !== "cancelled" &&
              (j.assignedManagerId === user._id ||
                (j.assignedTeamId && managerTeamIds.has(j.assignedTeamId)))
          );

      // Sort soonest first
      visibleJobs.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

      return Promise.all(
        visibleJobs.map(async (job) => {
          const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
          const cleaners = await Promise.all(
            job.cleanerIds.map(async (id) => {
              const u = await ctx.db.get(id);
              return u ? { _id: u._id, name: u.name } : null;
            })
          );
          const form = await ctx.db
            .query("forms")
            .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
            .first();
          // Derive inspection status (same logic as owner jobs list)
          const inspections = await ctx.db
            .query("managerInspections")
            .withIndex("by_jobId", (q) => q.eq("jobId", job._id))
            .collect();
          let inspectionStatus: "none" | "submitted" | "reinspection_requested" = "none";
          if (inspections.length > 0) {
            inspectionStatus = job.inspectionCycleOpen === true ? "reinspection_requested" : "submitted";
          }
          return {
            ...job,
            propertyName: property?.name ?? job.propertySnapshot?.name ?? "Unknown",
            propertyAddress: property?.address ?? job.propertySnapshot?.address ?? "",
            cleaners: cleaners.filter(Boolean),
            formStatus: form ? form.status : null,
            inspectionStatus,
            assignedTeamName: job.assignedTeamId ? (await ctx.db.get(job.assignedTeamId))?.name ?? null : null,
            assignmentType: job.assignedTeamId ? "team" : "individual",
          };
        })
      );
    });
  },
});

export const getCalendarJobs = query({
  args: {
    companyId: v.id("companies"),
    userId: v.id("users"),
    sessionToken: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    return await withPerfLog(ctx, "jobs:getCalendarJobs", async () => {
      const user = await requireVerifiedStaffSession(ctx, args.sessionToken, args.userId);
      if (user.companyId !== args.companyId) throw new Error("Access denied");

      const jobs = await ctx.db
        .query("jobs")
        .withIndex("by_companyId_scheduledDate", (q) =>
          q.eq("companyId", args.companyId)
        )
        .take(JOB_LIST_CAP);

      let filtered = jobs.filter(
        (j) =>
          j.scheduledDate >= args.startDate &&
          j.scheduledDate <= args.endDate &&
          j.status !== "cancelled"
      );

      if (user.role === "cleaner" || user.role === "maintenance") {
        const workerTeamIds = await getActiveTeamIdsForUser(ctx, user._id, args.companyId);
        filtered = filtered.filter(
          (j) =>
            j.cleanerIds.includes(user._id) ||
            (j.assignedTeamId && workerTeamIds.has(j.assignedTeamId))
        );
      } else if (user.role === "manager" && !hasManagerPermission(user, "canSeeAllJobs")) {
        const managerTeamIds = await getActiveTeamIdsForUser(ctx, user._id, args.companyId);
        filtered = filtered.filter(
          (j) => j.assignedManagerId === user._id || (j.assignedTeamId && managerTeamIds.has(j.assignedTeamId))
        );
      }

      return Promise.all(
        filtered.map(async (job) => {
          const property = job.propertyId ? await ctx.db.get(job.propertyId) : null;
          const cleaners = await Promise.all(
            job.cleanerIds.map(async (id) => {
              const u = await ctx.db.get(id);
              return u ? { _id: u._id, name: u.name } : null;
            })
          );
          const team = job.assignedTeamId ? await ctx.db.get(job.assignedTeamId) : null;
          const incomingSharedRecord = job.sharedFromJobId
            ? await ctx.db
                .query("sharedJobs")
                .withIndex("by_copiedJobId", (q) => q.eq("copiedJobId", job._id))
                .first()
            : null;
          const outgoingSharedRecords = await ctx.db
            .query("sharedJobs")
            .withIndex("by_originalJobId", (q) => q.eq("originalJobId", job._id))
            .collect();
          const partnerResponseStatus =
            incomingSharedRecord?.toCompanyId === args.companyId
              ? incomingSharedRecord.status
              : (["rejected", "pending", "accepted", "in_progress", "completed"] as const)
                  .find((status) => outgoingSharedRecords.some(
                    (record) => record.fromCompanyId === args.companyId && record.status === status,
                  )) ?? null;
          return {
            ...job,
            propertyName: property?.name ?? job.propertySnapshot?.name ?? "Unknown",
            cleaners: cleaners.filter(Boolean),
            assignedTeamName: team?.name ?? null,
            assignmentType: job.assignedTeamId ? "team" : "individual",
            partnerResponseStatus,
          };
        })
      );
    });
  },
});
