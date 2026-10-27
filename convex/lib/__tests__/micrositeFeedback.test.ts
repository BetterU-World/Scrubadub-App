import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import type { Doc, Id } from "../../_generated/dataModel";
import schema from "../../schema";
import { api } from "../../_generated/api";
import { getReviewedFeedbackBySlug } from "../../queries/companySites";

const modules = import.meta.glob("../../**/*.ts");
const query = api.queries.companySites.getReviewedFeedbackBySlug;
type Backend = ReturnType<typeof convexTest>;

async function seed(t: Backend) {
  return t.run(async ctx => {
    const companyA = await ctx.db.insert("companies", { name: "Company A", timezone: "America/New_York" });
    const companyB = await ctx.db.insert("companies", { name: "Company B", timezone: "America/New_York" });
    const siteA = await ctx.db.insert("companySites", { companyId: companyA, slug: "company-a", templateId: "A", brandName: "Company A", bio: "Cleaning", serviceArea: "Here", isPublished: true });
    await ctx.db.insert("companySites", { companyId: companyB, slug: "company-b", templateId: "A", brandName: "Company B", bio: "Cleaning", serviceArea: "There", isPublished: true });
    const requestA = await ctx.db.insert("clientRequests", request(companyA, "Morgan PrivateSurname"));
    const requestB = await ctx.db.insert("clientRequests", request(companyB, "Other PrivateSurname"));
    return { companyA, companyB, siteA, requestA, requestB };
  });
}

function request(companyId: Id<"companies">, requesterName = "Client PrivateSurname") {
  return { companyId, createdAt: 1, status: "new" as const, requesterName, requesterEmail: "secret@private.test", requesterPhone: "555-PRIVATE", propertySnapshot: { address: "Private residence", notes: "Private access details" }, source: "manual" as const };
}

function feedback(clientRequestId: Id<"clientRequests">, createdAt: number, overrides: Partial<Doc<"clientFeedback">> = {}) {
  return { clientRequestId, createdAt, rating: 5, comment: `Review ${createdAt}`, contactName: "Alex PrivateSurname", contactEmail: "reviewer@private.test", status: "reviewed" as const, featuredOnSite: true, ...overrides };
}

// Oracle for existing eligibility/order. A global collect is intentionally used
// ONLY in this local test to compare the optimized endpoint against old semantics.
async function expected(t: Backend, companyId: Id<"companies">, limit = 6) {
  return t.run(async ctx => {
    const requests = await ctx.db.query("clientRequests").withIndex("by_companyId", q => q.eq("companyId", companyId)).collect();
    const names = new Map(requests.map(row => [row._id, row.requesterName]));
    const all = await ctx.db.query("clientFeedback").withIndex("by_status_createdAt", q => q.eq("status", "reviewed")).order("desc").collect();
    return all.filter(row => names.has(row.clientRequestId) && row.featuredOnSite === true).slice(0, limit).map(row => ({
      id: row._id, rating: row.rating, comment: row.comment ?? null,
      displayName: (row.contactName || names.get(row.clientRequestId))?.split(" ")[0] ?? null,
      createdAt: row.createdAt,
    }));
  });
}

// Count documents actually returned by real in-memory indexed queries, rather
// than mocking results. These are logical reads, not Convex billing measurements.
async function traced(t: Backend, slug = "company-a", limit?: number) {
  const feedbackRows: Doc<"clientFeedback">[] = [];
  const requestRows: Doc<"clientRequests">[] = [];
  const indexes: Array<{ table: string; index: string }> = [];
  const takes: number[] = [];
  function record(table: string, rows: any[]) {
    if (table === "clientFeedback") feedbackRows.push(...rows);
    if (table === "clientRequests") requestRows.push(...rows);
  }
  function wrap(target: any, table: string): any {
    return new Proxy(target, { get(object, key) {
      if (key === Symbol.asyncIterator) return () => wrap(object[Symbol.asyncIterator](), table);
      const value = Reflect.get(object, key);
      if (key === "withIndex") return (index: string, range: any) => {
        indexes.push({ table, index });
        return wrap(object.withIndex(index, range), table);
      };
      if (key === "order" || key === "filter") return (...args: any[]) => wrap(value.apply(object, args), table);
      if (key === "next") return async () => {
        const next = await object.next();
        if (!next.done) record(table, [next.value]);
        return next;
      };
      if (["collect", "take", "first", "unique"].includes(String(key))) return async (...args: any[]) => {
        if (table === "clientFeedback" && key === "take") takes.push(args[0]);
        const result = await value.apply(object, args);
        record(table, Array.isArray(result) ? result : result ? [result] : []);
        return result;
      };
      return typeof value === "function" ? value.bind(object) : value;
    } });
  }
  const result = await t.run(ctx => (getReviewedFeedbackBySlug as any)._handler({ ...ctx, db: new Proxy(ctx.db, { get(object, key) {
    if (key === "query") return (table: string) => wrap(object.query(table as any), table);
    const value = Reflect.get(object, key);
    return typeof value === "function" ? value.bind(object) : value;
  } }) }, { slug, ...(limit === undefined ? {} : { limit }) }));
  return { result, feedbackRows, requestRows, indexes, takes };
}

describe("public microsite featured feedback", () => {
  it("preserves exact ordering and eligibility across requests, including equal review timestamps", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    await t.run(async ctx => {
      const lastRequest = await ctx.db.insert("clientRequests", request(s.companyA));
      // Fill the first request's top six at the cutoff timestamp before newer
      // tied reviews arrive on another request. A strict > cutoff loses them.
      for (let i = 0; i < 8; i++) await ctx.db.insert("clientFeedback", feedback(s.requestA, 50));
      for (let i = 0; i < 18; i++) {
        await ctx.db.insert("clientFeedback", feedback(i % 2 ? lastRequest : s.requestA, i < 10 ? i : 50));
        await ctx.db.insert("clientFeedback", feedback(s.requestB, i + 1000));
      }
      await ctx.db.insert("clientFeedback", feedback(s.requestA, 9000, { status: "new" }));
      await ctx.db.insert("clientFeedback", feedback(s.requestA, 9001, { featuredOnSite: false }));
      await ctx.db.insert("clientFeedback", feedback(s.requestA, 9002, { featuredOnSite: undefined }));
    });
    expect(await t.query(query, { slug: "company-a" })).toEqual(await expected(t, s.companyA));
    expect(await t.query(query, { slug: "company-b", limit: 9 })).toEqual(await expected(t, s.companyB, 9));
  });

  it("keeps default results and logical reads unchanged after adding 2,000 unrelated reviews", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    await t.run(async ctx => { for (let i = 0; i < 15; i++) await ctx.db.insert("clientFeedback", feedback(s.requestA, i)); });
    const before = await traced(t);
    await t.run(async ctx => { for (let i = 0; i < 2000; i++) await ctx.db.insert("clientFeedback", feedback(s.requestB, i + 1000)); });
    const after = await traced(t);
    expect(after.result).toEqual(before.result);
    expect(after.result).toHaveLength(6);
    expect(after.feedbackRows).toHaveLength(6);
    expect(after.feedbackRows.map(row => row._id)).toEqual(before.feedbackRows.map(row => row._id));
    expect(after.requestRows.map(row => row._id)).toEqual([s.requestA]);
    expect(after.feedbackRows.every(row => row.clientRequestId === s.requestA)).toBe(true);
    expect(after.indexes.filter(row => row.table === "clientFeedback")).toEqual([{ table: "clientFeedback", index: "by_clientRequestId_status_featuredOnSite_createdAt" }]);
    expect(after.takes).toEqual([6]);
  });

  it("does not read long ineligible or eligible feedback histories to select six reviews", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    await t.run(async ctx => {
      for (let i = 0; i < 500; i++) {
        await ctx.db.insert("clientFeedback", feedback(s.requestA, i));
        await ctx.db.insert("clientFeedback", feedback(s.requestA, i + 1000, { status: "new" }));
        await ctx.db.insert("clientFeedback", feedback(s.requestA, i + 2000, { featuredOnSite: false }));
      }
    });
    const reads = await traced(t);
    expect(reads.result).toEqual(await expected(t, s.companyA));
    expect(reads.feedbackRows).toHaveLength(6);
    expect(reads.feedbackRows.every(row => row.status === "reviewed" && row.featuredOnSite)).toBe(true);
  });

  it("checks late company requests rather than silently truncating review selection", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    let newestId: Id<"clientFeedback"> | undefined;
    await t.run(async ctx => {
      for (let i = 0; i < 40; i++) {
        const requestId = await ctx.db.insert("clientRequests", request(s.companyA));
        newestId = await ctx.db.insert("clientFeedback", feedback(requestId, i));
      }
    });
    const reads = await traced(t);
    expect(reads.result[0].id).toBe(newestId);
    expect(reads.result).toEqual(await expected(t, s.companyA));
    expect(reads.requestRows).toHaveLength(41);
    expect(reads.takes.every(limit => limit === 6)).toBe(true);
  });

  it("clamps excessive limits, floors fractional limits and returns empty for nonpositive limits", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    await t.run(async ctx => { for (let i = 0; i < 60; i++) await ctx.db.insert("clientFeedback", feedback(s.requestA, i)); });
    expect(await t.query(query, { slug: "company-a", limit: 1_000_000 })).toEqual(await expected(t, s.companyA, 24));
    expect((await traced(t, "company-a", 1_000_000)).takes).toEqual([24]);
    expect(await t.query(query, { slug: "company-a", limit: 2.9 })).toEqual(await expected(t, s.companyA, 2));
    for (const limit of [0, -1, -100]) {
      const reads = await traced(t, "company-a", limit);
      expect(reads.result).toEqual([]);
      expect(reads.indexes).toEqual([]);
    }
    for (const limit of [NaN, Infinity, -Infinity]) await expect(t.query(query, { slug: "company-a", limit })).rejects.toThrow("finite number");
  });

  it("returns only the public field allowlist and preserves name fallback and nulls", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    await t.run(async ctx => {
      await ctx.db.insert("clientFeedback", feedback(s.requestA, 3));
      await ctx.db.insert("clientFeedback", feedback(s.requestA, 2, { contactName: undefined, comment: undefined }));
      const blank = await ctx.db.insert("clientRequests", request(s.companyA, ""));
      await ctx.db.insert("clientFeedback", feedback(blank, 1, { contactName: undefined }));
    });
    const result = await t.query(query, { slug: "company-a" });
    expect(result.map(row => row.displayName)).toEqual(["Alex", "Morgan", null]);
    expect(result[1].comment).toBeNull();
    for (const row of result) expect(Object.keys(row).sort()).toEqual(["comment", "createdAt", "displayName", "id", "rating"]);
    expect(JSON.stringify(result)).not.toMatch(/PrivateSurname|private\.test|555-PRIVATE|Private residence|Private access|clientRequestId|companyId/);
  });

  it("keeps featuring independent of request archival, matching existing public eligibility", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    const id = await t.run(async ctx => {
      await ctx.db.patch(s.requestA, { status: "archived", archivedAt: 2 });
      return ctx.db.insert("clientFeedback", feedback(s.requestA, 1));
    });
    expect((await t.query(query, { slug: "company-a" })).map(row => row.id)).toEqual([id]);
  });

  it("returns empty for missing, invalid, unpublished and unconfigured microsites", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    await t.run(async ctx => {
      await ctx.db.insert("clientFeedback", feedback(s.requestA, 1));
      for (const slug of ["showcase", "bad_slug"]) await ctx.db.insert("companySites", { companyId: s.companyA, slug, templateId: "A", brandName: "Invalid", bio: "Configured", serviceArea: "Here", isPublished: true });
    });
    for (const slug of ["missing-site", "showcase", "bad_slug", ""]) expect(await t.query(query, { slug })).toEqual([]);
    expect((await traced(t, "bad_slug")).indexes).toEqual([]);
    await t.run(ctx => ctx.db.patch(s.siteA, { isPublished: false }));
    expect(await t.query(query, { slug: "company-a" })).toEqual([]);
    await t.run(ctx => ctx.db.patch(s.siteA, { isPublished: true, bio: "", serviceArea: "" }));
    expect(await t.query(query, { slug: "company-a" })).toEqual([]);
  });

  it("handles empty feedback, no requests, deleted requests, and missing companies without leaking reviews", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    expect(await t.query(query, { slug: "company-a" })).toEqual([]);
    await t.run(async ctx => {
      await ctx.db.insert("clientFeedback", feedback(s.requestA, 1));
      await ctx.db.insert("clientFeedback", feedback(s.requestB, 2));
      await ctx.db.delete(s.requestA);
    });
    expect(await t.query(query, { slug: "company-a" })).toEqual([]);
    expect((await traced(t)).feedbackRows).toEqual([]);
    await t.run(ctx => ctx.db.delete(s.companyB));
    expect(await t.query(query, { slug: "company-b" })).toEqual([]);
  });
});
