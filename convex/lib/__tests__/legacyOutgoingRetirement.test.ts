import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashToken } from "../tokens";
import { LEGACY_OUTGOING_RETIRED } from "../legacyOutgoingRetirement";

const modules = import.meta.glob("../../**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const company = await ctx.db.insert("companies", {
      name: "Payer",
      timezone: "America/New_York",
    });
    const other = await ctx.db.insert("companies", {
      name: "Partner",
      timezone: "America/New_York",
    });
    async function user(
      role: "owner" | "cleaner" | "manager",
      email: string,
      companyId = company,
    ) {
      const id = await ctx.db.insert("users", {
        role,
        email,
        companyId,
        name: email,
        status: "active",
        passwordHash: "unused",
        stripeConnectAccountId: "acct_historical",
      });
      const token = `test-session-${id}`;
      const now = Date.now();
      await ctx.db.insert("authSessions", {
        principalType: "staff",
        userId: id,
        tokenHash: hashToken(token),
        version: 1,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: now + 3600000,
        idleExpiresAt: now + 3600000,
      });
      return { id, token };
    }
    const owner = await user("owner", "owner@retirement.test");
    const worker = await user("cleaner", "worker@retirement.test");
    const manager = await user("manager", "manager@retirement.test");
    const foreign = await user("owner", "foreign@retirement.test", other);
    const admin = await user("owner", "dzbfyse@gmail.com");
    const job = await ctx.db.insert("jobs", {
      companyId: company,
      cleanerIds: [worker.id],
      type: "standard",
      status: "approved",
      scheduledDate: "2026-09-01",
      durationMinutes: 60,
      reworkCount: 0,
      plannedCleanerPayCents: 30000,
    });
    const payment = await ctx.db.insert("cleanerPayments", {
      companyId: company,
      jobId: job,
      cleanerUserId: worker.id,
      amountCents: 30000,
      method: "in_app",
      status: "OPEN",
      createdAt: 1,
    });
    await ctx.db.insert("cleanerPaymentJobs", {
      cleanerPaymentId: payment,
      jobId: job,
    });
    const settlement = await ctx.db.insert("companySettlements", {
      fromCompanyId: company,
      toCompanyId: other,
      originalJobId: job,
      amountCents: 30000,
      currency: "usd",
      status: "open",
      createdAt: 1,
      updatedAt: 1,
    });
    const batch = await ctx.db.insert("settlementBatches", {
      fromCompanyId: company,
      toCompanyId: other,
      totalAmountCents: 30000,
      currency: "usd",
      status: "OPEN",
      createdAt: 1,
    });
    await ctx.db.insert("settlementBatchItems", {
      batchId: batch,
      settlementId: settlement,
    });
    const affiliate = await ctx.db.insert("affiliatePayoutBatches", {
      createdAt: 1,
      createdByUserId: admin.id,
      method: "Stripe",
      totalCommissionCents: 30000,
      ledgerIds: [],
      status: "recorded",
      payoutStatus: "failed",
    });
    return {
      company,
      other,
      owner,
      worker,
      manager,
      foreign,
      admin,
      job,
      payment,
      settlement,
      batch,
      affiliate,
    };
  });
  return { t, ...ids };
}

async function financialSnapshot(s: Awaited<ReturnType<typeof setup>>) {
  return s.t.run(async (ctx) => ({
    payments: await ctx.db.query("cleanerPayments").collect(),
    links: await ctx.db.query("cleanerPaymentJobs").collect(),
    settlements: await ctx.db.query("companySettlements").collect(),
    batches: await ctx.db.query("settlementBatches").collect(),
    affiliate: await ctx.db.query("affiliatePayoutBatches").collect(),
    job: await ctx.db.get(s.job),
  }));
}

describe("permanent legacy outgoing containment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.TOKEN_PEPPER = "test-token-pepper";
    process.env.SCRUB_ENABLE_LIVE_INVOICE_PAYMENTS = "true";
    process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS = "false";
  });

  it("blocks individual/batch Checkout, onboarding and failed affiliate retries before any network request", async () => {
    const s = await setup();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Network must not be called"));
    const before = await financialSnapshot(s);
    const owner = { userId: s.owner.id, sessionToken: s.owner.token };
    for (let retry = 0; retry < 2; retry++) {
      await expect(
        s.t.action(api.actions.cleanerPayments.createCleanerPaymentCheckout, {
          ...owner,
          cleanerPaymentId: s.payment,
        }),
      ).rejects.toThrow(LEGACY_OUTGOING_RETIRED);
      await expect(
        s.t.action(api.actions.settlements.createSettlementPayCheckout, {
          ...owner,
          settlementId: s.settlement,
        }),
      ).rejects.toThrow(LEGACY_OUTGOING_RETIRED);
      await expect(
        s.t.action(api.actions.settlements.createSettlementBatchCheckout, {
          ...owner,
          batchId: s.batch,
        }),
      ).rejects.toThrow(LEGACY_OUTGOING_RETIRED);
      await expect(
        s.t.action(
          api.actions.cleanerStripeConnect.createCleanerStripeAccountLink,
          { userId: s.worker.id, sessionToken: s.worker.token },
        ),
      ).rejects.toThrow(LEGACY_OUTGOING_RETIRED);
      await expect(
        s.t.action(api.actions.stripePayouts.payPayoutBatchViaStripe, {
          userId: s.admin.id,
          sessionToken: s.admin.token,
          batchId: s.affiliate,
        }),
      ).rejects.toThrow(LEGACY_OUTGOING_RETIRED);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await financialSnapshot(s)).toEqual(before);
  });

  it("blocks every legacy financial write, including outside-paid and planned pay", async () => {
    const s = await setup();
    const before = await financialSnapshot(s);
    const owner = { userId: s.owner.id, sessionToken: s.owner.token };
    const calls = [
      () =>
        s.t.mutation(api.mutations.cleanerPayments.createCleanerPayment, {
          ...owner,
          jobId: s.job,
          amountCents: 30000,
        }),
      () =>
        s.t.mutation(api.mutations.cleanerPayments.markCleanerPaidOutside, {
          ...owner,
          jobId: s.job,
          amountCents: 30000,
        }),
      () =>
        s.t.mutation(api.mutations.cleanerPayments.createCleanerPaymentBatch, {
          ...owner,
          jobIds: [s.job],
          totalAmountCents: 30000,
        }),
      () =>
        s.t.mutation(
          api.mutations.cleanerPayments.markCleanerBatchPaidOutside,
          { ...owner, jobIds: [s.job], totalAmountCents: 30000 },
        ),
      () =>
        s.t.mutation(api.mutations.cleanerPayments.updateCleanerPaymentAmount, {
          ...owner,
          cleanerPaymentId: s.payment,
          amountCents: 40000,
        }),
      () =>
        s.t.mutation(api.mutations.cleanerPayments.sendStripeConnectInvite, {
          ...owner,
          cleanerUserId: s.worker.id,
        }),
      () =>
        s.t.mutation(api.mutations.jobs.updatePlannedCleanerPay, {
          ...owner,
          jobId: s.job,
          amountCents: 40000,
        }),
      () =>
        s.t.mutation(api.mutations.settlements.upsertSettlementForSharedJob, {
          ...owner,
          originalJobId: s.job,
          toCompanyId: s.other,
          amountCents: 40000,
        }),
      () =>
        s.t.mutation(api.mutations.settlements.markSettlementPaid, {
          ...owner,
          settlementId: s.settlement,
        }),
      () =>
        s.t.mutation(api.mutations.settlements.createSettlementBatch, {
          ...owner,
          settlementIds: [s.settlement],
        }),
      () =>
        s.t.mutation(api.mutations.settlements.markSettlementBatchPaidOutside, {
          ...owner,
          settlementIds: [s.settlement],
        }),
    ];
    for (const call of calls)
      await expect(call()).rejects.toThrow(LEGACY_OUTGOING_RETIRED);
    expect(await financialSnapshot(s)).toEqual(before);
    const user = await s.t.run((ctx) => ctx.db.get(s.worker.id));
    expect(user?.stripeConnectAccountId).toBe("acct_historical");
  });

  it("preserves authentication, owner-only authority and tenant isolation", async () => {
    const s = await setup();
    await expect(
      s.t.action(api.actions.cleanerPayments.createCleanerPaymentCheckout, {
        userId: s.owner.id,
        sessionToken: "",
        cleanerPaymentId: s.payment,
      }),
    ).rejects.toThrow("session");
    await expect(
      s.t.action(api.actions.cleanerPayments.createCleanerPaymentCheckout, {
        userId: s.foreign.id,
        sessionToken: s.foreign.token,
        cleanerPaymentId: s.payment,
      }),
    ).rejects.toThrow("Access denied");
    await expect(
      s.t.action(api.actions.settlements.createSettlementPayCheckout, {
        userId: s.foreign.id,
        sessionToken: s.foreign.token,
        settlementId: s.settlement,
      }),
    ).rejects.toThrow("Access denied");
    await expect(
      s.t.mutation(api.mutations.cleanerPayments.markCleanerPaidOutside, {
        userId: s.foreign.id,
        sessionToken: s.foreign.token,
        jobId: s.job,
        amountCents: 1,
      }),
    ).rejects.toThrow("Access denied");
    await expect(
      s.t.mutation(api.mutations.cleanerPayments.createCleanerPayment, {
        userId: s.manager.id,
        sessionToken: s.manager.token,
        jobId: s.job,
        amountCents: 1,
      }),
    ).rejects.toThrow("Owner");
    await expect(
      s.t.action(api.actions.stripePayouts.payPayoutBatchViaStripe, {
        userId: s.owner.id,
        sessionToken: s.owner.token,
        batchId: s.affiliate,
      }),
    ).rejects.toThrow("Super admin");
  });

  it("retains historical reads without inventing allocations or outside verification", async () => {
    const s = await setup();
    await s.t.run((ctx) =>
      ctx.db.patch(s.payment, {
        status: "PAID",
        method: "outside_app",
        paidAt: 1,
      }),
    );
    const ownerRows = await s.t.query(
      api.queries.cleanerPayments.listCleanerPaymentsForCompany,
      { userId: s.owner.id, sessionToken: s.owner.token },
    );
    const ownRows = await s.t.query(
      api.queries.cleanerPayments.listMyCleanerPayments,
      { userId: s.worker.id, sessionToken: s.worker.token },
    );
    expect(ownerRows[0]).toMatchObject({
      amountCents: 30000,
      status: "PAID",
      method: "outside_app",
    });
    expect(ownRows[0]).toMatchObject({
      amountCents: 30000,
      status: "PAID",
      method: "outside_app",
    });
    expect(
      await s.t.query(
        api.queries.cleanerPayments.listCleanerPaymentsForCompany,
        { userId: s.foreign.id, sessionToken: s.foreign.token },
      ),
    ).toEqual([]);
    expect(
      await s.t.query(api.queries.settlements.listMySettlements, {
        userId: s.owner.id,
        sessionToken: s.owner.token,
        status: "open",
      }),
    ).toHaveLength(1);
    expect(
      await s.t.run((ctx) => ctx.db.query("cleanerPaymentJobs").first()),
    ).not.toHaveProperty("amountCents");
  });

  it("allows operational submission and approval without automatically creating legacy debt", async () => {
    vi.useFakeTimers();
    process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS = "true";
    try {
      const s = await setup();
      const form = await s.t.run(async (ctx) => {
        await ctx.db.delete(s.payment);
        await ctx.db.patch(s.job, {
          status: "in_progress",
          cleanerPaymentId: undefined,
        });
        return ctx.db.insert("forms", {
          jobId: s.job,
          companyId: s.company,
          cleanerId: s.worker.id,
          status: "in_progress",
        });
      });
      await s.t.mutation(api.mutations.forms.submit, {
        formId: form,
        userId: s.worker.id,
        sessionToken: s.worker.token,
      });
      await s.t.mutation(api.mutations.jobs.completeJob, {
        jobId: s.job,
        userId: s.worker.id,
        sessionToken: s.worker.token,
      });
      await s.t.mutation(api.mutations.forms.approve, {
        formId: form,
        userId: s.owner.id,
        sessionToken: s.owner.token,
      });
      expect((await s.t.run((ctx) => ctx.db.get(s.job)))?.status).toBe(
        "approved",
      );
      expect(
        await s.t.run((ctx) => ctx.db.query("cleanerPayments").collect()),
      ).toEqual([]);
      expect(
        (await s.t.run((ctx) => ctx.db.get(s.job)))?.cleanerPaymentId,
      ).toBeUndefined();
      await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["worker", "partner", "batch"])(
    "preserves %s completion, duplicate safety and distinct-object audit evidence",
    async (kind) => {
      const s = await setup();
      const ref =
        kind === "worker"
          ? internal.mutations.cleanerPayments.markCleanerPaidViaStripe
          : kind === "partner"
            ? internal.mutations.settlements.markSettlementPaidViaStripe
            : internal.mutations.settlements.markSettlementBatchPaidViaStripe;
      const args = {
        ...(kind === "worker"
          ? { cleanerPaymentId: s.payment }
          : kind === "partner"
            ? { settlementId: s.settlement }
            : { batchId: s.batch }),
        stripeCheckoutSessionId: "cs_original",
        stripePaymentIntentId: "pi_original",
        payerUserId: s.owner.id,
      };
      await s.t.mutation(ref as any, args);
      const before = await financialSnapshot(s);
      await s.t.mutation(ref as any, args);
      expect(await financialSnapshot(s)).toEqual(before);
      const different = {
        ...args,
        stripeCheckoutSessionId: "cs_distinct",
        stripePaymentIntentId: "pi_distinct",
      };
      await s.t.mutation(ref as any, different);
      await s.t.mutation(ref as any, different);
      expect(await financialSnapshot(s)).toEqual(before);
      const audits = await s.t.run((ctx) => ctx.db.query("auditLog").collect());
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe("legacy_outgoing_reconciliation_required");
      expect(audits[0].details).toContain("cs_distinct");
    },
  );

  it("retains signed platform webhook compatibility without fabricating destination accounts", async () => {
    const s = await setup();
    process.env.STRIPE_SECRET_KEY = "sk_test_fixture_only";
    process.env.STRIPE_WEBHOOK_ACCOUNT_SECRET = "whsec_fixture_only";
    const stripe = new Stripe("sk_test_fixture_only");
    const payload = JSON.stringify({
      id: "evt_legacy",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_existing",
          payment_status: "paid",
          payment_intent: "pi_existing",
          metadata: {
            type: "settlement_payment",
            settlementId: String(s.settlement),
            recipientCompanyId: String(s.other),
            payerUserId: String(s.owner.id),
          },
        },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_fixture_only",
    });
    for (let retry = 0; retry < 2; retry++) {
      const response = await s.t.fetch("/stripe/webhook", {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": signature },
      });
      expect(response.status).toBe(200);
    }
    const row = await s.t.run((ctx) => ctx.db.get(s.settlement));
    expect(row).toMatchObject({
      status: "paid",
      stripeCheckoutSessionId: "cs_existing",
    });
    expect(row?.stripeDestinationAccountId).toBeUndefined();
    expect(
      (await s.t.fetch("/stripe/webhook", { method: "POST", body: payload }))
        .status,
    ).toBe(400);
  });

  it("removes stale frontend creation controls and keeps invoice creation separate", () => {
    const files = [
      "pages/owner/JobDetailPage.tsx",
      "pages/owner/CleanerPaymentsPage.tsx",
      "pages/owner/SettlementsPage.tsx",
      "pages/worker/CleanerSettingsPage.tsx",
      "components/affiliate/AffiliateLedgerTab.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(`packages/frontend/src/${file}`, "utf8");
      expect(source).not.toMatch(
        /createCleanerPaymentCheckout|createSettlementPayCheckout|createSettlementBatchCheckout|createCleanerStripeAccountLink|payPayoutBatchViaStripe|sendStripeConnectInviteMut/,
      );
    }
    expect(readFileSync("convex/invoiceActions.ts", "utf8")).toContain(
      "stripe.checkout.sessions.create",
    );
    for (const file of [
      "cleanerPayments",
      "settlements",
      "stripePayouts",
      "cleanerStripeConnect",
    ]) {
      const source = readFileSync(`convex/actions/${file}.ts`, "utf8");
      expect(source).not.toMatch(
        /sessions.create|transfers.create|accounts.create|accountLinks.create|SCRUB_ENABLE_LIVE_INVOICE_PAYMENTS/,
      );
    }
  });
});
