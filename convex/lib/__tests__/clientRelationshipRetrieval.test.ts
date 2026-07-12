import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { api } from "../../_generated/api";

const modules = import.meta.glob("../../**/*.ts");

function testBackend() {
  return convexTest(schema, modules);
}

async function seedCompany(t: ReturnType<typeof testBackend>, suffix: string) {
  return await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", {
      name: `Company ${suffix}`,
      timezone: "America/New_York",
    });
    const ownerId = await ctx.db.insert("users", {
      email: `owner-${suffix}@example.com`,
      passwordHash: "test",
      name: `Owner ${suffix}`,
      companyId,
      role: "owner",
      status: "active",
    });
    return { companyId, ownerId };
  });
}

async function seedClient(t: ReturnType<typeof testBackend>, companyId: any, suffix: string) {
  return await t.run((ctx) => ctx.db.insert("clientRelationships", {
    companyId,
    displayName: `Client ${suffix}`,
    clientType: "residential",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
  }));
}

async function getDetail(t: ReturnType<typeof testBackend>, ownerId: any, relationshipId: any) {
  return await t.query(api.queries.clientRelationships.getClientRelationshipDetail, {
    userId: ownerId,
    relationshipId,
  });
}

describe("Client Detail relationship retrieval", () => {
  it("returns the stable response shape with empty arrays for a Client without related records", async () => {
    const t = testBackend();
    const { companyId, ownerId } = await seedCompany(t, "empty");
    const relationshipId = await seedClient(t, companyId, "empty");

    const detail = await getDetail(t, ownerId, relationshipId);
    expect(detail).not.toBeNull();
    expect(Object.keys(detail!).sort()).toEqual([
      "commercialAccounts",
      "invoices",
      "jobs",
      "leads",
      "properties",
      "proposals",
      "relationship",
      "serviceAgreements",
      "walkthroughs",
    ]);
    for (const key of [
      "leads",
      "properties",
      "commercialAccounts",
      "walkthroughs",
      "proposals",
      "serviceAgreements",
      "invoices",
      "jobs",
    ] as const) {
      expect(detail![key]).toEqual([]);
    }
  });

  it("returns only directly linked records from every table with existing sort behavior and accurate counts", async () => {
    const t = testBackend();
    const { companyId, ownerId } = await seedCompany(t, "complete");
    const relationshipId = await seedClient(t, companyId, "target");
    const otherRelationshipId = await seedClient(t, companyId, "other");

    const ids = await t.run(async (ctx) => {
      const olderLeadId = await ctx.db.insert("clientRequests", {
        companyId,
        clientRelationshipId: relationshipId,
        createdAt: 10,
        status: "new",
        requesterName: "Older Lead",
        requesterEmail: "older@example.com",
        propertySnapshot: {},
        source: "manual",
      });
      const newerLeadId = await ctx.db.insert("clientRequests", {
        companyId,
        clientRelationshipId: relationshipId,
        createdAt: 20,
        status: "new",
        requesterName: "Newer Lead",
        requesterEmail: "newer@example.com",
        propertySnapshot: {},
        source: "manual",
      });
      await ctx.db.insert("clientRequests", {
        companyId,
        clientRelationshipId: otherRelationshipId,
        createdAt: 30,
        status: "new",
        requesterName: "Other Lead",
        requesterEmail: "other@example.com",
        propertySnapshot: {},
        source: "manual",
      });

      const propertyBId = await ctx.db.insert("properties", {
        companyId,
        clientRelationshipId: relationshipId,
        name: "Zulu",
        type: "residential",
        address: "2 Main St",
        amenities: [],
        active: true,
      });
      const propertyAId = await ctx.db.insert("properties", {
        companyId,
        clientRelationshipId: relationshipId,
        name: "Alpha",
        type: "residential",
        address: "1 Main St",
        amenities: [],
        active: true,
      });
      await ctx.db.insert("properties", {
        companyId,
        name: "Unlinked",
        type: "residential",
        address: "3 Main St",
        amenities: [],
        active: true,
      });

      const olderProposalId = await ctx.db.insert("proposals", {
        companyId,
        clientRelationshipId: relationshipId,
        clientRequestId: olderLeadId,
        createdByUserId: ownerId,
        title: "Older Proposal",
        clientName: "Target",
        status: "accepted",
        createdAt: 10,
        updatedAt: 10,
      });
      const newerProposalId = await ctx.db.insert("proposals", {
        companyId,
        clientRelationshipId: relationshipId,
        clientRequestId: newerLeadId,
        createdByUserId: ownerId,
        title: "Newer Proposal",
        clientName: "Target",
        status: "accepted",
        createdAt: 20,
        updatedAt: 20,
      });

      const accountOldId = await ctx.db.insert("commercialAccounts", {
        companyId,
        clientRelationshipId: relationshipId,
        clientName: "Older Account",
        status: "active",
        createdAt: 10,
        updatedAt: 10,
      });
      const accountNewId = await ctx.db.insert("commercialAccounts", {
        companyId,
        clientRelationshipId: relationshipId,
        clientName: "Newer Account",
        status: "active",
        createdAt: 20,
        updatedAt: 20,
      });
      await ctx.db.insert("commercialAccounts", {
        companyId,
        clientRelationshipId: otherRelationshipId,
        clientName: "Other Account",
        status: "active",
        createdAt: 30,
        updatedAt: 30,
      });

      const walkthroughOldId = await ctx.db.insert("walkthroughs", {
        companyId,
        clientRelationshipId: relationshipId,
        clientRequestId: olderLeadId,
        title: "Older Walkthrough",
        walkthroughType: "residential",
        status: "completed",
        createdAt: 10,
        updatedAt: 10,
      });
      const walkthroughNewId = await ctx.db.insert("walkthroughs", {
        companyId,
        clientRelationshipId: relationshipId,
        clientRequestId: newerLeadId,
        title: "Newer Walkthrough",
        walkthroughType: "residential",
        status: "completed",
        createdAt: 20,
        updatedAt: 20,
      });

      const agreementOldId = await ctx.db.insert("serviceAgreements", {
        companyId,
        clientRelationshipId: relationshipId,
        proposalId: olderProposalId,
        title: "Older Agreement",
        status: "draft",
        agreementType: "commercial_cleaning",
        createdAt: 10,
        updatedAt: 10,
      });
      const agreementNewId = await ctx.db.insert("serviceAgreements", {
        companyId,
        clientRelationshipId: relationshipId,
        proposalId: newerProposalId,
        title: "Newer Agreement",
        status: "draft",
        agreementType: "commercial_cleaning",
        createdAt: 20,
        updatedAt: 20,
      });

      const jobOldId = await ctx.db.insert("jobs", {
        companyId,
        clientRelationshipId: relationshipId,
        propertyId: propertyAId,
        cleanerIds: [],
        type: "standard",
        status: "approved",
        scheduledDate: "2030-01-01",
        durationMinutes: 60,
        reworkCount: 0,
      });
      const jobNewId = await ctx.db.insert("jobs", {
        companyId,
        clientRelationshipId: relationshipId,
        propertyId: propertyBId,
        cleanerIds: [],
        type: "standard",
        status: "scheduled",
        scheduledDate: "2030-02-01",
        durationMinutes: 60,
        reworkCount: 0,
      });

      const invoiceOldId = await ctx.db.insert("invoices", {
        companyId,
        clientRelationshipId: relationshipId,
        commercialAccountId: accountOldId,
        title: "Older Invoice",
        invoiceNumber: "INV-1",
        status: "issued",
        billingStartDate: "2030-01-01",
        billingEndDate: "2030-01-31",
        issueDate: "2030-02-01",
        dueDate: "2030-03-01",
        subtotalCents: 100,
        taxCents: 0,
        totalCents: 100,
        jobIds: [jobOldId],
        createdAt: 10,
        updatedAt: 10,
      });
      const invoiceNewId = await ctx.db.insert("invoices", {
        companyId,
        clientRelationshipId: relationshipId,
        commercialAccountId: accountNewId,
        title: "Newer Invoice",
        invoiceNumber: "INV-2",
        status: "paid",
        billingStartDate: "2030-02-01",
        billingEndDate: "2030-02-28",
        issueDate: "2030-03-01",
        dueDate: "2030-04-01",
        subtotalCents: 200,
        taxCents: 0,
        totalCents: 200,
        jobIds: [jobNewId],
        createdAt: 20,
        updatedAt: 20,
      });

      return {
        leads: [newerLeadId, olderLeadId],
        properties: [propertyAId, propertyBId],
        accounts: [accountNewId, accountOldId],
        walkthroughs: [walkthroughNewId, walkthroughOldId],
        proposals: [newerProposalId, olderProposalId],
        agreements: [agreementNewId, agreementOldId],
        invoices: [invoiceNewId, invoiceOldId],
        jobs: [jobNewId, jobOldId],
      };
    });

    const detail = await getDetail(t, ownerId, relationshipId);
    expect(detail?.leads.map((item) => item._id)).toEqual(ids.leads);
    expect(detail?.properties.map((item) => item._id)).toEqual(ids.properties);
    expect(detail?.commercialAccounts.map((item) => item._id)).toEqual(ids.accounts);
    expect(detail?.walkthroughs.map((item) => item._id)).toEqual(ids.walkthroughs);
    expect(detail?.proposals.map((item) => item._id)).toEqual(ids.proposals);
    expect(detail?.serviceAgreements.map((item) => item._id)).toEqual(ids.agreements);
    expect(detail?.invoices.map((item) => item._id)).toEqual(ids.invoices);
    expect(detail?.jobs.map((item) => item._id)).toEqual(ids.jobs);

    const client = await t.query(api.queries.clientRelationships.getById, {
      userId: ownerId,
      relationshipId,
    });
    expect(client?.counts).toEqual({
      requestCount: 2,
      commercialAccountCount: 2,
      propertyCount: 2,
      invoiceCount: 2,
    });
  });

  it("returns a linked Property inserted after 501 unrelated company Properties", async () => {
    const t = testBackend();
    const { companyId, ownerId } = await seedCompany(t, "property-cap");
    const targetRelationshipId = await seedClient(t, companyId, "property-target");
    const otherRelationshipId = await seedClient(t, companyId, "property-other");

    const targetPropertyId = await t.run(async (ctx) => {
      for (let index = 0; index < 501; index++) {
        await ctx.db.insert("properties", {
          companyId,
          clientRelationshipId: otherRelationshipId,
          name: `Unrelated ${String(index).padStart(3, "0")}`,
          type: "residential",
          address: `${index} Other St`,
          amenities: [],
          active: true,
        });
      }
      return await ctx.db.insert("properties", {
        companyId,
        clientRelationshipId: targetRelationshipId,
        name: "Target Property",
        type: "residential",
        address: "Target St",
        amenities: [],
        active: true,
      });
    });

    const detail = await getDetail(t, ownerId, targetRelationshipId);
    expect(detail?.properties.map((property) => property._id)).toEqual([targetPropertyId]);
  });

  it("returns a linked Job despite 501 unrelated company Jobs and rejects another company's Client", async () => {
    const t = testBackend();
    const companyA = await seedCompany(t, "jobs-a");
    const companyB = await seedCompany(t, "jobs-b");
    const targetRelationshipId = await seedClient(t, companyA.companyId, "jobs-target");
    const otherRelationshipId = await seedClient(t, companyA.companyId, "jobs-other");
    const foreignRelationshipId = await seedClient(t, companyB.companyId, "jobs-foreign");

    const targetJobId = await t.run(async (ctx) => {
      for (let index = 0; index < 501; index++) {
        await ctx.db.insert("jobs", {
          companyId: companyA.companyId,
          clientRelationshipId: otherRelationshipId,
          cleanerIds: [],
          type: "standard",
          status: "scheduled",
          scheduledDate: `2030-01-${String((index % 28) + 1).padStart(2, "0")}`,
          durationMinutes: 60,
          reworkCount: 0,
        });
      }
      return await ctx.db.insert("jobs", {
        companyId: companyA.companyId,
        clientRelationshipId: targetRelationshipId,
        cleanerIds: [],
        type: "standard",
        status: "scheduled",
        scheduledDate: "2099-12-31",
        durationMinutes: 60,
        reworkCount: 0,
      });
    });

    const detail = await getDetail(t, companyA.ownerId, targetRelationshipId);
    expect(detail?.jobs.map((job) => job._id)).toEqual([targetJobId]);
    await expect(getDetail(t, companyA.ownerId, foreignRelationshipId)).rejects.toThrow("Access denied");
  });
});
