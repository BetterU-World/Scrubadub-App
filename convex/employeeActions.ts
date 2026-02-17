"use node";

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { hashPassword } from "./lib/password";
import {
  generateSecureToken,
  hashToken,
  INVITE_TOKEN_EXPIRY_MS,
} from "./lib/tokens";
import { validatePassword, validateEmail, validateName } from "./lib/validation";

export const inviteCleaner = action({
  args: {
    companyId: v.id("companies"),
    email: v.string(),
    name: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    validateEmail(args.email);
    validateName(args.name);
    const email = args.email.toLowerCase();

    const existing = await ctx.runQuery(internal.authInternal.getUserByEmail, {
      email,
    });
    if (existing) throw new Error("Email already registered");

    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const expiry = Date.now() + INVITE_TOKEN_EXPIRY_MS;

    const newUserId = await ctx.runMutation(internal.authInternal.createUser, {
      email,
      passwordHash: "",
      name: args.name,
      companyId: args.companyId,
      role: "cleaner",
      status: "pending",
      inviteTokenHash: tokenHash,
      inviteTokenExpiry: expiry,
    });

    await ctx.runMutation(internal.authInternal.logAuditEntry, {
      companyId: args.companyId,
      userId: args.userId,
      action: "invite_cleaner",
      entityType: "user",
      entityId: newUserId,
      details: `Invited ${email}`,
    });

    return { token, userId: newUserId };
  },
});

export const acceptInvite = action({
  args: {
    token: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    validatePassword(args.password);

    const tokenHash = hashToken(args.token);
    const user = await ctx.runQuery(
      internal.authInternal.getUserByInviteTokenHash,
      { tokenHash }
    );

    if (!user) throw new Error("Invalid or expired invite link");
    if (user.status !== "pending") throw new Error("Invite already used");
    if (user.inviteTokenExpiry && user.inviteTokenExpiry < Date.now()) {
      throw new Error("Invite link has expired");
    }

    const passwordHash = await hashPassword(args.password);

    await ctx.runMutation(internal.authInternal.consumeInviteToken, {
      userId: user._id,
      passwordHash,
    });

    await ctx.runMutation(internal.authInternal.logAuditEntry, {
      companyId: user.companyId,
      userId: user._id,
      action: "accept_invite",
      entityType: "user",
      entityId: user._id,
    });

    return {
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
    };
  },
});
