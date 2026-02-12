import { v } from "convex/values";

export const roleValidator = v.union(v.literal("owner"), v.literal("cleaner"));

export const userStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("pending")
);

export const propertyTypeValidator = v.union(
  v.literal("residential"),
  v.literal("commercial"),
  v.literal("vacation_rental"),
  v.literal("office")
);

export const jobTypeValidator = v.union(
  v.literal("standard"),
  v.literal("deep_clean"),
  v.literal("turnover"),
  v.literal("move_in_out")
);

export const jobStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("confirmed"),
  v.literal("denied"),
  v.literal("in_progress"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("rework_requested"),
  v.literal("cancelled")
);

export const redFlagCategoryValidator = v.union(
  v.literal("damage"),
  v.literal("safety"),
  v.literal("cleanliness"),
  v.literal("maintenance"),
  v.literal("other")
);

export const severityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical")
);

export const redFlagStatusValidator = v.union(
  v.literal("open"),
  v.literal("acknowledged"),
  v.literal("resolved")
);

export const notificationTypeValidator = v.union(
  v.literal("job_assigned"),
  v.literal("job_confirmed"),
  v.literal("job_denied"),
  v.literal("job_started"),
  v.literal("job_submitted"),
  v.literal("job_approved"),
  v.literal("rework_requested"),
  v.literal("red_flag"),
  v.literal("invite")
);

export const formStatusValidator = v.union(
  v.literal("in_progress"),
  v.literal("submitted"),
  v.literal("approved"),
  v.literal("rework_requested")
);
