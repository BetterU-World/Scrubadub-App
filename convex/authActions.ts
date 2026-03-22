"use node";

import { action, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  hashPassword,
  verifyBcryptPassword,
  isLegacyHash,
  verifyLegacyPassword,
} from "./lib/password";
import { generateSecureToken, hashToken, RESET_TOKEN_EXPIRY_MS } from "./lib/tokens";
import { validatePassword, validateEmail, validateName } from "./lib/validation";
import { validateRequiredEnv } from "./lib/validateEnv";

validateRequiredEnv();

/**
 * Actions
 */

export const signUp = action({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    companyName: v.string(),
    timezone: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ userId: Id<"users">; companyId: Id<"companies"> }> => {
    validateEmail(args.email);
    validatePassword(args.password);
    validateName(args.name);
    validateName(args.companyName);

    const email = args.email.toLowerCase();

    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: `e:${email}:signUp`,
      limit: 3,
      windowMs: 60_000,
    });

    const existing = await ctx.runQuery(internal.authInternal.getUserByEmail, {
      email,
    });
    if (existing) throw new Error("Unable to create account");

    const passwordHash = await hashPassword(args.password);

    const companyId: Id<"companies"> = await ctx.runMutation(
      internal.authInternal.createCompany,
      {
        name: args.companyName,
        timezone: args.timezone ?? "America/New_York",
      }
    );

    const userId: Id<"users"> = await ctx.runMutation(
      internal.authInternal.createUser,
      {
        email,
        passwordHash,
        name: args.name,
        companyId,
        role: "owner",
        status: "active",
      }
    );

    return { userId, companyId };
  },
});

export const signIn = action({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    userId: Id<"users">;
    email: string;
    name: string;
    role: string;
    companyId: Id<"companies">;
    status: string;
  }> => {
    const email = args.email.toLowerCase();

    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: `e:${email}:signIn`,
      limit: 5,
      windowMs: 60_000,
    });

    const genericError = "Invalid email or password";

    const user = await ctx.runQuery(internal.authInternal.getUserByEmail, {
      email,
    });
    if (!user) throw new Error(genericError);
    if (user.status === "inactive") throw new Error(genericError);

    let passwordValid = false;

    if (isLegacyHash(user.passwordHash)) {
      passwordValid = verifyLegacyPassword(args.password, user.passwordHash);
      if (passwordValid) {
        const newHash = await hashPassword(args.password);
        await ctx.runMutation(internal.authInternal.updatePasswordHash, {
          userId: user._id,
          passwordHash: newHash,
        });
      }
    } else {
      passwordValid = await verifyBcryptPassword(args.password, user.passwordHash);
    }

    if (!passwordValid) throw new Error(genericError);

    return {
      userId: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      status: user.status,
    };
  },
});

export const requestPasswordReset = action({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const email = args.email.toLowerCase();

    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: `e:${email}:requestPasswordReset`,
      limit: 3,
      windowMs: 60_000,
    });

    const user = await ctx.runQuery(internal.authInternal.getUserByEmail, {
      email,
    });

    // Always return success to prevent user enumeration
    if (!user) return { success: true };

    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const expiry = Date.now() + RESET_TOKEN_EXPIRY_MS;

    // Schema uses resetToken (not resetTokenHash)
    await ctx.runMutation(internal.authInternal.setResetToken, {
      userId: user._id,
      resetToken: tokenHash,
      resetTokenExpiry: expiry,
    });

    // Schedule email async — does not block the response
    await ctx.runMutation(internal.mutations.scheduleEmail.schedulePasswordResetEmail, {
      email,
      token,
    });

    return { success: true };
  },
});

export const resetPassword = action({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    validatePassword(args.newPassword);

    // Rate limit by first 8 chars of token to avoid storing full token as key
    const tokenPrefix = args.token.slice(0, 8);
    await ctx.runMutation(internal.rateLimitInternal.enforce, {
      key: `tp:${tokenPrefix}:resetPassword`,
      limit: 5,
      windowMs: 60_000,
    });

    const tokenHash = hashToken(args.token);

    // Schema/index uses resetToken (not resetTokenHash)
    const user = await ctx.runQuery(internal.authInternal.getUserByresetToken, {
      tokenHash,
    });

    if (!user) throw new Error("Invalid or expired reset token");
    if (!user.resetTokenExpiry || user.resetTokenExpiry < Date.now()) {
      throw new Error("Invalid or expired reset token");
    }

    const passwordHash = await hashPassword(args.newPassword);

    await ctx.runMutation(internal.authInternal.consumeResetToken, {
      userId: user._id,
      passwordHash,
    });

    return { success: true };
  },
});

