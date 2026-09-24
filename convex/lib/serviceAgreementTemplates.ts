export async function approvedServiceAgreementTemplates(ctx: any, companyId: any) {
  const templates = await ctx.db.query("documentTemplates")
    .withIndex("by_company_type", (q: any) => q.eq("companyId", companyId).eq("type", "service_agreement"))
    .collect();
  return templates.filter((template: any) => template.status !== "archived");
}

export async function approvedServiceAgreementTemplate(ctx: any, companyId: any, templateId: any) {
  const template = await ctx.db.get(templateId);
  if (!template || template.companyId !== companyId || template.type !== "service_agreement" || template.status === "archived") {
    throw new Error("Active company Service Agreement template required");
  }
  return template;
}
