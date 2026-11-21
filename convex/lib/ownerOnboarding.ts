import { v } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

export const ownerGoal = v.union(v.literal("schedule"), v.literal("invite"), v.literal("property"));

export const ownerOnboardingPreferences = v.object({
  companyId: v.id("companies"),
  cohort: v.union(v.literal("signup"), v.literal("existing")),
  welcomeHandled: v.optional(v.boolean()),
  announcementDismissed: v.optional(v.boolean()),
  dashboardDismissed: v.optional(v.boolean()),
  goal: v.optional(ownerGoal),
});

export function signupOnboarding(companyId: Id<"companies">) {
  return { companyId, cohort: "signup" as const };
}

export function onboardingFor(user: Doc<"users"> & { companyId: Id<"companies"> }): Infer<typeof ownerOnboardingPreferences> {
  return user.ownerOnboarding?.companyId === user.companyId
    ? user.ownerOnboarding
    : { companyId: user.companyId, cohort: "existing" as const };
}
