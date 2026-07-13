import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { SecurityEventInput } from "./securityEvents";

export async function recordSecurityEventFromAction(ctx: ActionCtx, event: SecurityEventInput) {
  try {
    await ctx.runMutation((internal as any).securityEventInternal.record, event);
  } catch (error) {
    console.error("[security-events] event dispatch failed", error instanceof Error ? error.message : "unknown");
  }
}
