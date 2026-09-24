import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { hashPassword } from "../password";
import { proposalIssueContent } from "../proposalIssueContent";
import { safeProposalPayload } from "../../proposalDeliveryInternal";
import { buildServiceAgreementIssueContent } from "../serviceAgreementIssuedContent";

const modules = import.meta.glob("../../**/*.ts");
const password = "test-password-123";
const hub = (api as any).queries.documentsHub;

beforeEach(() => { process.env.TOKEN_PEPPER = "d1-test-pepper"; });

async function setup() {
  const t = convexTest(schema, modules);
  const passwordHash = await hashPassword(password);
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "D1 Co", timezone: "America/New_York" });
    const otherCompanyId = await ctx.db.insert("companies", { name: "Other Co", timezone: "America/New_York" });
    const ownerId = await ctx.db.insert("users", { companyId, email: "d1-owner@example.test", passwordHash, name: "Owner", role: "owner", status: "active" });
    const salesId = await ctx.db.insert("users", { companyId, email: "d1-sales@example.test", passwordHash, name: "Sales", role: "manager", status: "active", canManageSalesAndCommercial: true });
    const documentsId = await ctx.db.insert("users", { companyId, email: "d1-documents@example.test", passwordHash, name: "Documents", role: "manager", status: "active", canManageDocuments: true });
    const otherOwnerId = await ctx.db.insert("users", { companyId: otherCompanyId, email: "d1-other@example.test", passwordHash, name: "Other", role: "owner", status: "active" });
    const requestId = await ctx.db.insert("clientRequests", { companyId, requesterName: "Client", requesterEmail: "client@example.test", propertySnapshot: { address: "1 Main St" }, requestedService: "Cleaning", source: "manual", status: "new", createdAt: 1 });
    const proposalId = await ctx.db.insert("proposals", { companyId, clientRequestId: requestId, createdByUserId: ownerId, title: "Working proposal", clientName: "Client", businessName: "Business", propertyAddress: "1 Main St", scopeOfWork: "Cleaning", monthlyPriceCents: 10000, status: "draft", createdAt: 1, updatedAt: 1 });
    const agreementId = await ctx.db.insert("serviceAgreements", { companyId, proposalId, clientRequestId: requestId, title: "Working agreement", clientName: "Client", propertyAddress: "1 Main St", agreementType: "commercial_cleaning", status: "draft", createdAt: 2, updatedAt: 2 });
    return { companyId, ownerId, salesId, documentsId, otherOwnerId, requestId, proposalId, agreementId };
  });
  const sessions = await Promise.all(["d1-owner", "d1-sales", "d1-documents", "d1-other"].map((name) => t.action(api.authActions.signIn, { email: `${name}@example.test`, password })));
  return { t, ...ids, owner: { userId: ids.ownerId, sessionToken: sessions[0].sessionToken }, sales: { userId: ids.salesId, sessionToken: sessions[1].sessionToken }, documents: { userId: ids.documentsId, sessionToken: sessions[2].sessionToken }, other: { userId: ids.otherOwnerId, sessionToken: sessions[3].sessionToken } };
}

describe("Documents Hub projection", () => {
  it("includes drafts for Owner and sales Manager, while denying document-only Manager and other company", async () => {
    const s = await setup();
    const owner: any = await s.t.query(hub.listClientDocuments, s.owner);
    expect(owner.rows).toHaveLength(2);
    expect(owner.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "proposal", status: "draft", title: "Working proposal", provenance: "working", issueNumber: null }),
      expect.objectContaining({ type: "service_agreement", status: "draft", title: "Working agreement", provenance: "working", issueNumber: null }),
    ]));
    expect((await s.t.query(hub.listClientDocuments, s.sales) as any).rows).toHaveLength(2);
    await expect(s.t.query(hub.listClientDocuments, s.documents)).rejects.toThrow();
    expect((await s.t.query(hub.listClientDocuments, s.other) as any).rows).toHaveLength(0);
    await expect(s.t.query(hub.getClientDocumentHistory, { ...s.other, type: "proposal", documentId: s.proposalId })).rejects.toThrow("Document unavailable");
  });

  it("keeps one Proposal row and binds responded content to its immutable issue", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      const proposal = (await ctx.db.get(s.proposalId))!;
      const content = proposalIssueContent(await safeProposalPayload(ctx, proposal));
      content.proposal.title = "Issued proposal";
      const first = await ctx.db.insert("proposalIssues", { companyId: s.companyId, proposalId: s.proposalId, issueNumber: 1, content, preparedAt: 10, issuedAt: 10, withdrawnAt: 20 });
      const second = await ctx.db.insert("proposalIssues", { companyId: s.companyId, proposalId: s.proposalId, issueNumber: 2, content: { ...content, proposal: { ...content.proposal, title: "Accepted issue" } }, preparedAt: 30, issuedAt: 30 });
      await ctx.db.patch(s.proposalId, { title: "Edited working title", status: "accepted", acceptedAt: 40, sentAt: 30, currentIssueId: second, responseIssueId: second, updatedAt: 50 });
    });
    const rows: any = await s.t.query(hub.listClientDocuments, s.owner);
    expect(rows.rows.filter((row: any) => row.type === "proposal")).toEqual([expect.objectContaining({ title: "Accepted issue", status: "accepted", issueNumber: 2, date: 40, hasHistory: true, provenance: "issued_snapshot" })]);
    const history: any[] = await s.t.query(hub.getClientDocumentHistory, { ...s.owner, type: "proposal", documentId: s.proposalId });
    expect(history).toEqual([
      expect.objectContaining({ issueNumber: 2, title: "Accepted issue", state: "accepted", responseAt: 40 }),
      expect.objectContaining({ issueNumber: 1, title: "Issued proposal", state: "previous" }),
    ]);
  });

  it("keeps Agreement acknowledgment and external signed receipt distinct", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      const agreement = (await ctx.db.get(s.agreementId))!;
      const content = await buildServiceAgreementIssueContent(ctx, agreement);
      const issueId = await ctx.db.insert("serviceAgreementIssues", { companyId: s.companyId, agreementId: s.agreementId, issueNumber: 1, content: { ...content, title: "Issued agreement" }, preparedAt: 10, issuedAt: 10 });
      await ctx.db.patch(s.agreementId, { title: "Edited working agreement", status: "signed", sentAt: 10, acknowledgedAt: 20, acknowledgedIssueId: issueId, currentIssueId: issueId, updatedAt: 20 });
    });
    const acknowledged: any = await s.t.query(hub.listClientDocuments, s.owner);
    expect(acknowledged.rows.find((row: any) => row.type === "service_agreement")).toMatchObject({ status: "acknowledged", title: "Issued agreement", issueNumber: 1, date: 20 });
    await s.t.run(async (ctx) => { await ctx.db.patch(s.agreementId, { signedAt: 30, signedReceivedIssueId: (await ctx.db.get(s.agreementId))!.currentIssueId, updatedAt: 30 }); });
    const signed: any = await s.t.query(hub.listClientDocuments, s.owner);
    expect(signed.rows.find((row: any) => row.type === "service_agreement")).toMatchObject({ status: "signed_received", date: 30 });
    const history: any[] = await s.t.query(hub.getClientDocumentHistory, { ...s.owner, type: "service_agreement", documentId: s.agreementId });
    expect(history[0]).toMatchObject({ issueNumber: 1, title: "Issued agreement", state: "signed_received", responseAt: 30 });
  });

  it("keeps withdrawn proposals in Draft and presents legacy, Ready, declined and cancelled states truthfully", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      const proposal = (await ctx.db.get(s.proposalId))!;
      const content = proposalIssueContent(await safeProposalPayload(ctx, proposal));
      await ctx.db.insert("proposalIssues", { companyId: s.companyId, proposalId: s.proposalId, issueNumber: 1, content, preparedAt: 5, issuedAt: 5, withdrawnAt: 10 });
      await ctx.db.patch(s.proposalId, { title: "Revised draft", status: "draft", updatedAt: 11 });
      await ctx.db.patch(s.agreementId, { status: "ready", readyAt: 12, updatedAt: 12 });
    });
    let rows: any = await s.t.query(hub.listClientDocuments, s.owner);
    expect(rows.rows.find((row: any) => row.type === "proposal")).toMatchObject({ status: "draft", title: "Revised draft", issueNumber: null, hasHistory: true });
    expect(rows.rows.find((row: any) => row.type === "service_agreement")).toMatchObject({ status: "ready", date: 12 });
    const history: any[] = await s.t.query(hub.getClientDocumentHistory, { ...s.owner, type: "proposal", documentId: s.proposalId });
    expect(history).toEqual([expect.objectContaining({ issueNumber: 1, state: "previous" })]);
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.proposalId, { status: "declined", declinedAt: 20, updatedAt: 20 });
      await ctx.db.patch(s.agreementId, { status: "cancelled", cancelledAt: 21, updatedAt: 21 });
    });
    rows = await s.t.query(hub.listClientDocuments, s.owner);
    expect(rows.rows.find((row: any) => row.type === "proposal")).toMatchObject({ status: "declined", provenance: "legacy_current", issueNumber: null, date: 20 });
    expect(rows.rows.find((row: any) => row.type === "service_agreement")).toMatchObject({ status: "cancelled", provenance: "legacy_current", issueNumber: null, date: 21 });
  });
});
