import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Simple password hashing (in production, use bcrypt via action)
// For MVP, we use a simple hash approach
function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  // Add salt-like prefix so it's not trivially reversible
  return `sh_${Math.abs(hash).toString(36)}_${password.length}`;
}

function verifyPassword(password: string, hash: string): boolean {
  return simpleHash(password) === hash;
}

export const signUp = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    companyName: v.string(),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if email already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
    if (existing) throw new Error("Email already registered");

    // Create company
    const companyId = await ctx.db.insert("companies", {
      name: args.companyName,
      timezone: args.timezone ?? "America/New_York",
    });

    // Create owner user
    const userId = await ctx.db.insert("users", {
      email: args.email.toLowerCase(),
      passwordHash: simpleHash(args.password),
      name: args.name,
      companyId,
      role: "owner",
      status: "active",
    });

    return { userId, companyId };
  },
});

export const signIn = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
    if (!user) throw new Error("Invalid email or password");
    if (!verifyPassword(args.password, user.passwordHash)) {
      throw new Error("Invalid email or password");
    }
    if (user.status === "inactive") {
      throw new Error("Account has been deactivated");
    }

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

export const getUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      status: user.status,
      phone: user.phone,
    };
  },
});

export const getCurrentUser = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (!args.userId) return null;
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    const company = await ctx.db.get(user.companyId);
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      companyName: company?.name ?? "",
      status: user.status,
      phone: user.phone,
    };
  },
});

export const requestPasswordReset = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    // Silently return if user not found (don't reveal if email exists)
    if (!user) return { success: true };

    const resetToken = `pr_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour

    await ctx.db.patch(user._id, {
      resetToken,
      resetTokenExpiry,
    });

    return { success: true, token: resetToken };
  },
});

export const resetPassword = mutation({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_resetToken", (q) => q.eq("resetToken", args.token))
      .first();

    if (!user) throw new Error("Invalid or expired reset token");
    if (!user.resetTokenExpiry || user.resetTokenExpiry < Date.now()) {
      throw new Error("Reset token has expired");
    }

    await ctx.db.patch(user._id, {
      passwordHash: simpleHash(args.newPassword),
      resetToken: undefined,
      resetTokenExpiry: undefined,
    });

    return { success: true };
  },
});
