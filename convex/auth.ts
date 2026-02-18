import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// --- Internal functions (called by authActions.ts via internal API) ---

export const createUserAndCompany = internalMutation({
  args: {
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    companyName: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) throw new Error("Email already registered");

    const companyId = await ctx.db.insert("companies", {
      name: args.companyName,
      timezone: args.timezone,
    });

    const userId = await ctx.db.insert("users", {
      email: args.email,
      passwordHash: args.passwordHash,
      name: args.name,
      companyId,
      role: "owner",
      status: "active",
    });

    return { userId, companyId };
  },
});

export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const createSession = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const token = generateToken();
    await ctx.db.insert("sessions", {
      userId: args.userId,
      token,
      expiresAt: Date.now() + SESSION_DURATION,
    });
    return token;
  },
});

export const deleteSession = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (session) await ctx.db.delete(session._id);
  },
});

export const activateInvitedUser = internalMutation({
  args: {
    inviteToken: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_inviteToken", (q) => q.eq("inviteToken", args.inviteToken))
      .first();
    if (!user) throw new Error("Invalid invite link");
    if (user.status !== "pending") throw new Error("Invite already used");

    await ctx.db.patch(user._id, {
      passwordHash: args.passwordHash,
      status: "active",
      inviteToken: undefined,
    });

    await ctx.db.insert("auditLog", {
      companyId: user.companyId,
      userId: user._id,
      action: "accept_invite",
      entityType: "user",
      entityId: user._id,
      timestamp: Date.now(),
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

export const updatePasswordByResetToken = internalMutation({
  args: {
    resetToken: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_resetToken", (q) => q.eq("resetToken", args.resetToken))
      .first();
    if (!user) throw new Error("Invalid or expired reset token");
    if (!user.resetTokenExpiry || user.resetTokenExpiry < Date.now()) {
      throw new Error("Reset token has expired");
    }

    await ctx.db.patch(user._id, {
      passwordHash: args.passwordHash,
      resetToken: undefined,
      resetTokenExpiry: undefined,
    });

    return { success: true };
  },
});

// --- Public queries ---

export const getCurrentUser = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!args.sessionToken) return null;

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .first();
    if (!session || session.expiresAt < Date.now()) return null;

    const user = await ctx.db.get(session.userId);
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

// --- Public mutations ---

export const requestPasswordReset = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    // Always return success to not reveal if email exists
    if (!user) return { success: true };

    const resetToken = generateToken();
    const resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour

    await ctx.db.patch(user._id, {
      resetToken,
      resetTokenExpiry,
    });

    // TODO: Integrate email provider to send reset link with token.
    // The token is intentionally NOT returned to the client.
    return { success: true };
  },
});
