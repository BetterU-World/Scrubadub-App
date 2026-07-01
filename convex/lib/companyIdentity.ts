import type { Id } from "../_generated/dataModel";

export type CompanyIdentity = {
  companyName: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  licenseNumber: string | null;
  insuranceInformation: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  emailSignature: string | null;
  documentHeader: string | null;
  documentFooter: string | null;
  defaultFont: string | null;
  defaultDateFormat: string;
  defaultCurrency: string;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function getCompanyIdentity(
  ctx: any,
  companyId: Id<"companies">,
  options?: { includeSiteFallback?: boolean }
): Promise<CompanyIdentity> {
  const [company, settings, site] = await Promise.all([
    ctx.db.get(companyId),
    (ctx.db as any)
      .query("companySettings")
      .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
      .first(),
    options?.includeSiteFallback === false
      ? null
      : ctx.db
          .query("companySites")
          .withIndex("by_companyId", (q: any) => q.eq("companyId", companyId))
          .first(),
  ]);

  const logoUrl = settings?.logoStorageId
    ? await ctx.storage.getUrl(settings.logoStorageId)
    : text(settings?.logoUrl) ?? text(site?.logoUrl);

  return {
    companyName:
      text(settings?.companyName) ??
      text(site?.brandName) ??
      text(company?.companyDisplayName) ??
      text(company?.name) ??
      "Your Cleaning Company",
    logoUrl,
    phone: text(settings?.phone) ?? text(site?.publicPhone) ?? text(company?.contactPhone),
    email: text(settings?.email) ?? text(site?.publicEmail) ?? text(company?.contactEmail),
    website: text(settings?.website),
    address: text(settings?.address),
    licenseNumber: text(settings?.licenseNumber),
    insuranceInformation: text(settings?.insuranceInformation),
    primaryColor: text(settings?.primaryColor),
    secondaryColor: text(settings?.secondaryColor),
    accentColor: text(settings?.accentColor),
    emailSignature: text(settings?.emailSignature),
    documentHeader: text(settings?.documentHeader),
    documentFooter: text(settings?.documentFooter),
    defaultFont: text(settings?.defaultFont),
    defaultDateFormat: text(settings?.defaultDateFormat) ?? "MM/dd/yyyy",
    defaultCurrency: text(settings?.defaultCurrency) ?? "USD",
  };
}
