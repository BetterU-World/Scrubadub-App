"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import bcrypt from "bcryptjs";
import { internal } from "./_generated/api";

const BCRYPT_ROUNDS = 12;

export const signUp = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    companyName: v.string(),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const passwordHash = await bcrypt.hash(args.password, BCRYPT_ROUNDS);

    const result = await ctx.runMutation(internal.auth.createUserAndCompany, {
      email: args.email.toLowerCase(),
      passwordHash,
      name: args.name,
      companyName: args.companyName,
      timezone: args.timezone ?? "America/New_York",
    });

    const sessionToken = await ctx.runMutation(internal.auth.createSession, {
      userId: result.userId,
    });

    return { userId: result.userId, companyId: result.companyId, sessionToken };
  },
});

export const signIn = action({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.auth.getUserByEmail, {
      email: args.email.toLowerCase(),
    });
    if (!user) throw new Error("Invalid email or password");

    const valid = await bcrypt.compare(args.password, user.passwordHash);
    if (!valid) throw new Error("Invalid email or password");

    if (user.status === "inactive") {
      throw new Error("Account has been deactivated");
    }

    const sessionToken = await ctx.runMutation(internal.auth.createSession, {
      userId: user._id,
    });

    return { sessionToken };
  },
});

export const signOut = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.auth.deleteSession, {
      token: args.sessionToken,
    });
  },
});

export const acceptInvite = action({
  args: {
    token: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.password.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const passwordHash = await bcrypt.hash(args.password, BCRYPT_ROUNDS);

    const result = await ctx.runMutation(internal.auth.activateInvitedUser, {
      inviteToken: args.token,
      passwordHash,
    });

    const sessionToken = await ctx.runMutation(internal.auth.createSession, {
      userId: result.userId,
    });

    return { ...result, sessionToken };
  },
});

export const resetPassword = action({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters");
    }

    const passwordHash = await bcrypt.hash(args.newPassword, BCRYPT_ROUNDS);

    return await ctx.runMutation(internal.auth.updatePasswordByResetToken, {
      resetToken: args.token,
      passwordHash,
    });
  },
});
