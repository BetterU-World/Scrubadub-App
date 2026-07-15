function validEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function resolveOperationalEmailIdentity(ctx: any, companyId: any) {
  const company = await ctx.db.get(companyId);
  const owners = await ctx.db
    .query("users")
    .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
    .collect();
  const activeOwner = owners
    .filter((user: any) => user.role === "owner" && user.status === "active" && validEmail(user.email))
    .sort((a: any, b: any) => a._creationTime - b._creationTime)[0];

  return {
    companyName: company?.companyDisplayName ?? company?.name ?? "Your Cleaning Company",
    replyTo: validEmail(company?.contactEmail)
      ? company.contactEmail.trim()
      : activeOwner?.email?.trim(),
  };
}
