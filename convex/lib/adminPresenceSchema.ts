import { defineTable } from "convex/server";
import { v } from "convex/values";

const role = v.union(
  v.literal("owner"),
  v.literal("manager"),
  v.literal("cleaner"),
  v.literal("maintenance"),
);
export const adminPresenceTables = {
  hubObservation: defineTable({
    version: v.number(),
    startedAt: v.number(),
  }).index("by_version", ["version"]),
  hubDailyPresence: defineTable({
    companyId: v.id("companies"),
    userId: v.id("users"),
    role,
    day: v.string(),
    version: v.number(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_company_user_role_day_version", [
      "companyId",
      "userId",
      "role",
      "day",
      "version",
    ])
    .index("by_company_day", ["companyId", "day"])
    .index("by_expiresAt", ["expiresAt"]),
  hubCompanyPresence: defineTable({
    companyId: v.id("companies"),
    group: v.union(v.literal("owner"), v.literal("staff")),
    version: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_company_group_version", ["companyId", "group", "version"])
    .index("by_lastSeenAt", ["lastSeenAt"]),
};
