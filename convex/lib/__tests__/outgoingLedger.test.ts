import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { readFileSync } from "node:fs";
import schema from "../../schema";
import { api, internal } from "../../_generated/api";
import { hashToken } from "../tokens";
import { MAX_OUTGOING_CENTS } from "../outgoingLedger";
import type { Id } from "../../_generated/dataModel";
import type { FunctionArgs } from "convex/server";
import { vi } from "vitest";

const modules = import.meta.glob("../../**/*.ts");
const m = api.outgoingMutations;
const q = api.outgoingQueries;
const page = { numItems: 50, cursor: null };

describe("PR C worker compensation", () => {
  const c = api.workerCompensation;
  async function review(
    s: Awaited<ReturnType<typeof setup>>,
    workerId = s.worker.userId,
    amountCents = 12000,
    reason = "Reviewed work",
  ) {
    return s.t.mutation(c.reviewCompensation, {
      ...s.owner,
      jobId: s.job,
      workerId,
      amountCents,
      reason,
    });
  }
  it("approves independent JOB × WORKER units and safely retries concurrent approvals", async () => {
    const s = await setup();
    const ids = await Promise.all([review(s), review(s)]);
    expect(ids[0]).toBe(ids[1]);
    expect((await s.financialRows()).obligations).toHaveLength(1);
    const pending = await s.t.query(c.jobCompensation, {
      ...s.owner,
      jobId: s.job,
    });
    expect(pending.workers).toHaveLength(2);
    expect(pending.obligations).toHaveLength(1);
    const second = await review(s, s.coworker.userId, 9000);
    expect(second).not.toBe(ids[0]);
    expect(await review(s, s.coworker.userId, 9000)).toBe(second);
    expect(
      (await s.financialRows()).obligations
        .map((o) => o.basePrincipalCents)
        .sort((a, b) => a - b),
    ).toEqual([9000, 12000]);
    await expect(review(s, s.worker.userId, 13000)).rejects.toThrow(
      "adjustment",
    );
    await s.assertEvidence();
  });
  it.each([
    "scheduled",
    "submitted",
    "denied",
    "cancelled",
    "rework_requested",
  ] as const)("does not approve compensation for %s work", async (status) => {
    const s = await setup();
    await s.t.run((ctx) => ctx.db.patch(s.job, { status }));
    await expect(review(s)).rejects.toThrow("evidence required");
    expect((await s.financialRows()).obligations).toHaveLength(0);
  });
  it("assignment alone is not eligibility; historical confirmation is explicit, owner only, and debt free", async () => {
    const s = await setup();
    await s.t.run((ctx) =>
      ctx.db.patch(s.job, {
        executionHistory: undefined,
        approvedExecutionSequence: undefined,
      }),
    );
    await expect(review(s)).rejects.toThrow("evidence required");
    const args = {
      jobId: s.job,
      performedWorkerIds: [s.worker.userId, s.coworker.userId, s.owner.userId],
    };
    await expect(
      s.t.mutation(c.confirmHistoricalWorkers, { ...s.manager, ...args }),
    ).rejects.toThrow();
    await expect(
      s.t.mutation(c.confirmHistoricalWorkers, { ...s.foreign, ...args }),
    ).rejects.toThrow("Access denied");
    await s.t.mutation(c.confirmHistoricalWorkers, { ...s.owner, ...args });
    const data = await s.t.query(c.jobCompensation, {
      ...s.owner,
      jobId: s.job,
    });
    expect(data.evidence?.provenance).toBe("owner_confirmed_historical");
    expect(data.workers).toHaveLength(2);
    expect((await s.financialRows()).obligations).toHaveLength(0);
    await expect(review(s, s.owner.userId)).rejects.toThrow(
      "evidence required",
    );
    await expect(
      s.t.mutation(c.confirmHistoricalWorkers, { ...s.owner, ...args }),
    ).rejects.toThrow("Only historical");
  });
  it("preserves explicit no-compensation review without zero-dollar debt", async () => {
    const s = await setup();
    expect(await review(s, s.worker.userId, 0, "Training")).toBeNull();
    expect(await review(s, s.worker.userId, 0, "Training")).toBeNull();
    expect((await s.financialRows()).obligations).toHaveLength(0);
    expect(
      (await s.t.query(c.jobCompensation, { ...s.owner, jobId: s.job }))
        .workers[0].noCompensation?.reason,
    ).toBe("Training");
    await expect(review(s)).rejects.toThrow("already reviewed");
  });
  it("suggestions are not debt, never split planned pay, and cannot change approved principal", async () => {
    const s = await setup();
    expect(
      (
        await s.t.query(c.jobCompensation, { ...s.owner, jobId: s.job })
      ).workers.map((w) => w.suggestionCents),
    ).toEqual([undefined, undefined]);
    await s.t.run((ctx) =>
      ctx.db.patch(s.profile, {
        payProfile: {
          payType: "per_job",
          defaultRateCents: 7777,
          currency: "USD",
        },
      }),
    );
    expect(
      (await s.t.query(c.jobCompensation, { ...s.owner, jobId: s.job }))
        .workers[0].suggestionCents,
    ).toBe(7777);
    const id = await review(s, s.worker.userId, 5555);
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.job, { plannedCleanerPayCents: 1, cleanerIds: [] });
      await ctx.db.patch(s.profile, {
        payProfile: { payType: "per_job", defaultRateCents: 1 },
      });
    });
    expect((await s.state(id!)).basePrincipalCents).toBe(5555);
  });
  it("freezes recipients and execution, survives reassignment, renames and deactivation, and remains settleable", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.worker.userId, {
        name: "Renamed",
        status: "inactive",
      });
      await ctx.db.patch(s.job, {
        cleanerIds: [s.coworker.userId],
        scheduledDate: "2030-01-01",
      });
    });
    const id = await review(s);
    expect((await s.state(id!)).recipient.displayName).toBe("worker");
    expect((await s.state(id!)).sourceLabel).toContain("2026-09-01");
    await s.record(12000);
    expect((await s.state(id!)).outstandingCents).toBe(0);
    expect(
      (await s.t.query(c.workerBalances, s.owner))[0].recordedPaidCents,
    ).toBe(12000);
  });
  it("enforces owner writes and manager financial read capability", async () => {
    const s = await setup();
    for (const actor of [s.manager, s.restricted, s.worker, s.foreign])
      await expect(
        s.t.mutation(c.reviewCompensation, {
          ...actor,
          jobId: s.job,
          workerId: s.worker.userId,
          amountCents: 12000,
          reason: "work",
        }),
      ).rejects.toThrow();
    await expect(
      s.t.query(c.jobCompensation, { ...s.manager, jobId: s.job }),
    ).resolves.toHaveProperty("workers");
    await expect(
      s.t.query(c.jobCompensation, { ...s.restricted, jobId: s.job }),
    ).rejects.toThrow();
    await expect(s.t.query(c.workerBalances, s.foreign)).resolves.toEqual([]);
  });
  it("previews oldest-first and selected jobs using canonical math, then commits exactly the preview", async () => {
    const s = await setup();
    const a = await s.obligation(10000);
    const b = await s.obligation(10000);
    const d = await s.obligation(10000);
    const preview = await s.t.query(c.previewPayment, {
      ...s.owner,
      workerId: s.worker.userId,
      amountCents: 15000,
    });
    expect(preview.error).toBeNull();
    expect(preview.allocations.map((x) => x.amountCents)).toEqual([
      10000, 5000,
    ]);
    const id = await s.record(15000, "preview", {
      allocations: preview.allocations.map(({ sourceLabel, ...row }) => row),
    });
    expect(
      (
        await s.t.query(q.getSettlementDetail, { ...s.owner, settlementId: id })
      ).allocations.map((x) => x.amountCents),
    ).toEqual([10000, 5000]);
    const selected = await s.t.query(c.previewPayment, {
      ...s.owner,
      workerId: s.worker.userId,
      amountCents: 10000,
      selectedObligationIds: [d],
    });
    expect(selected.allocations[0].obligationId).toBe(d);
    await s.record(10000, "selected-preview", {
      allocations: selected.allocations.map(({ sourceLabel, ...row }) => row),
    });
    expect((await s.state(d)).outstandingCents).toBe(0);
    expect(
      (await s.state(a)).outstandingCents + (await s.state(b)).outstandingCents,
    ).toBe(5000);
    expect(
      (
        await s.t.query(c.previewPayment, {
          ...s.owner,
          workerId: s.worker.userId,
          amountCents: 999999,
        })
      ).error,
    ).toContain("exceeds");
  });
  it("rejects a stale preview rather than silently reallocating", async () => {
    const s = await setup();
    const id = await s.obligation(10000);
    const preview = await s.t.query(c.previewPayment, {
      ...s.owner,
      workerId: s.worker.userId,
      amountCents: 5000,
    });
    await s.record(1000, "intervening");
    await expect(
      s.record(5000, "stale-preview", {
        allocations: preview.allocations.map(({ sourceLabel, ...row }) => row),
      }),
    ).rejects.toThrow("Stale");
    expect((await s.state(id)).recordedPaidCents).toBe(1000);
  });
  it("captures explicit submission rosters, retains rework history, and makes only the approved execution eligible", async () => {
    vi.useFakeTimers();
    process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS = "true";
    const s = await setup();
    try {
      const form = await s.t.run(async (ctx) => {
        await ctx.db.patch(s.job, {
          status: "in_progress",
          cleanerIds: [s.worker.userId, s.coworker.userId],
          executionHistory: undefined,
          approvedExecutionSequence: undefined,
        });
        return ctx.db.insert("forms", {
          jobId: s.job,
          companyId: s.company,
          cleanerId: s.worker.userId,
          status: "in_progress",
        });
      });
      await expect(
        s.t.mutation(api.mutations.forms.submit, { ...s.worker, formId: form }),
      ).rejects.toThrow("Confirm the workers");
      await s.t.mutation(api.mutations.forms.submit, {
        ...s.worker,
        formId: form,
        performedWorkerIds: [s.worker.userId, s.coworker.userId],
      });
      await expect(review(s)).rejects.toThrow("evidence required");
      await s.t.mutation(api.mutations.forms.requestRework, {
        ...s.owner,
        formId: form,
        notes: "Redo",
      });
      await s.t.mutation(api.mutations.jobs.startJob, {
        ...s.worker,
        jobId: s.job,
      });
      await s.t.mutation(api.mutations.forms.submit, {
        ...s.worker,
        formId: form,
        performedWorkerIds: [s.coworker.userId],
      });
      await s.t.mutation(api.mutations.forms.approve, {
        ...s.manager,
        formId: form,
      });
      const job = await s.t.run((ctx) => ctx.db.get(s.job));
      expect(job?.executionHistory).toHaveLength(2);
      expect(job?.approvedExecutionSequence).toBe(2);
      expect((await s.financialRows()).obligations).toHaveLength(0);
      await expect(review(s)).rejects.toThrow("evidence required");
      await review(s, s.coworker.userId, 9000);
      expect((await s.financialRows()).obligations).toHaveLength(1);
      await s.t.mutation(api.mutations.forms.submit, {
        ...s.worker,
        formId: form,
      });
      expect(
        (await s.t.run((ctx) => ctx.db.get(s.job)))?.executionHistory,
      ).toEqual(job?.executionHistory);
    } finally {
      await s.t.finishAllScheduledFunctions(vi.runAllTimers);
      vi.useRealTimers();
      delete process.env.SCRUB_DISABLE_EXTERNAL_SIDE_EFFECTS;
    }
  });
  it("freezes team workers instead of consulting later membership", async () => {
    const s = await setup();
    const before = await s.t.run(async (ctx) => {
      const teamId = await ctx.db.insert("teams", {
        companyId: s.company,
        name: "Team",
        active: true,
        createdBy: s.owner.userId,
        createdAt: 1,
        updatedAt: 1,
      });
      const member = await ctx.db.insert("teamMembers", {
        companyId: s.company,
        teamId,
        userId: s.worker.userId,
        role: "lead",
        active: true,
        addedAt: 1,
      });
      await ctx.db.patch(s.job, { assignedTeamId: teamId, cleanerIds: [] });
      return { member, job: await ctx.db.get(s.job) };
    });
    await s.t.run((ctx) => ctx.db.patch(before.member, { active: false }));
    expect(
      (await s.t.query(c.jobCompensation, { ...s.owner, jobId: s.job }))
        .evidence,
    ).toEqual(before.job?.executionHistory?.[0]);
    await review(s);
  });
});

describe("PR C preserved boundaries", () => {
  it("records owner self-work without creating worker compensation", async () => {
    const s = await setup();
    await s.t.run(ctx => ctx.db.patch(s.job, { status: "in_progress", cleanerIds: [], assignedManagerId: s.owner.userId, executionHistory: undefined, approvedExecutionSequence: undefined }));
    await s.t.mutation(api.mutations.jobs.ownerCompleteJob, { ...s.owner, jobId: s.job, performedWorkerIds: [s.owner.userId] });
    const review = await s.t.query(api.workerCompensation.jobCompensation, { ...s.owner, jobId: s.job });
    expect(review.evidence?.workers[0].role).toBe("owner");
    expect(review.workers).toEqual([]);
    expect((await s.financialRows()).obligations).toEqual([]);
  });
  it("preserves partner source uniqueness across terms versions", async () => {
    const s = await setup();
    const draft = () => s.t.mutation(m.createDraftTerms, { ...s.owner, source: { type: "partner_shared_job", sharedJobId: s.share }, currency: "USD", lines: [{ lineId: "partner", recipient: { type: "partner_company", companyId: s.other }, amountCents: 12000, basis: "accepted work" }] });
    const approve = (termsId: Id<"outgoingTerms">) => s.t.mutation(internal.outgoingMutations.approveAndMaterialize, { termsId, approverUserId: s.owner.userId, expectedRevision: 1, partnerAcceptance: { actorUserId: s.foreign.userId, evidence: "accepted terms" } });
    await approve(await draft());
    await expect(approve(await draft())).rejects.toThrow("Source already materialized");
    expect((await s.financialRows()).obligations).toHaveLength(1);
  });
});

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
      name: string,
      companyId = company,
      canViewFinancials = false,
    ) {
      const id = await ctx.db.insert("users", {
        role,
        name,
        email: `${name}@ledger.test`,
        companyId,
        passwordHash: "fixture",
        status: "active",
        canViewFinancials,
        canApproveForms: true,
        canManageInvoices: true,
        canManageTeam: true,
      });
      const sessionToken = `outgoing-${id}`;
      const now = Date.now();
      await ctx.db.insert("authSessions", {
        principalType: "staff",
        userId: id,
        tokenHash: hashToken(sessionToken),
        version: 1,
        createdAt: now,
        lastUsedAt: now,
        expiresAt: now + 3600000,
        idleExpiresAt: now + 3600000,
      });
      return { userId: id, sessionToken };
    }
    const owner = await user("owner", "owner");
    const worker = await user("cleaner", "worker");
    const coworker = await user("cleaner", "coworker");
    const manager = await user("manager", "manager", company, true);
    const restricted = await user("manager", "restricted");
    const foreign = await user("owner", "foreign", other);
    const profile = await ctx.db.insert("workerProfiles", {
      companyId: company,
      userId: worker.userId,
      workerType: "contractor_1099",
      workerStatus: "active",
      primaryRole: "cleaner",
      eligibleRoles: ["cleaner"],
      onboardingStatus: "complete",
      jobEligibilityStatus: "eligible",
      createdAt: now(),
      updatedAt: now(),
    });
    const job = await ctx.db.insert("jobs", {
      companyId: company,
      cleanerIds: [worker.userId],
      type: "standard",
      status: "approved",
      scheduledDate: "2026-09-01",
      durationMinutes: 60,
      reworkCount: 0,
      plannedCleanerPayCents: 88888,
      approvedExecutionSequence: 1,
      executionHistory: [
        {
          sequence: 1,
          provenance: "submission_confirmed",
          confirmedById: worker.userId,
          confirmedAt: 1,
          scheduledDate: "2026-09-01",
          workers: [
            { userId: worker.userId, displayName: "worker", role: "cleaner" },
            {
              userId: coworker.userId,
              displayName: "coworker",
              role: "cleaner",
            },
          ],
        },
      ],
    });
    const foreignJob = await ctx.db.insert("jobs", {
      companyId: other,
      cleanerIds: [],
      type: "standard",
      status: "approved",
      scheduledDate: "2026-09-01",
      durationMinutes: 60,
      reworkCount: 0,
    });
    const share = await ctx.db.insert("sharedJobs", {
      originalJobId: job,
      copiedJobId: foreignJob,
      fromCompanyId: company,
      toCompanyId: other,
      sharePackage: false,
      status: "accepted",
    });
    await ctx.db.insert("cleanerPayments", {
      companyId: company,
      jobId: job,
      cleanerUserId: worker.userId,
      status: "OPEN",
      createdAt: 1,
    });
    await ctx.db.insert("companySettlements", {
      fromCompanyId: company,
      toCompanyId: other,
      originalJobId: job,
      amountCents: 33333,
      currency: "usd",
      status: "open",
      createdAt: 1,
      updatedAt: 1,
    });
    return {
      company,
      other,
      owner,
      worker,
      coworker,
      manager,
      restricted,
      foreign,
      profile,
      job,
      foreignJob,
      share,
    };
  });
  async function draft(
    amountCents = 30000,
    recipient = ids.worker.userId,
    jobId = ids.job,
  ) {
    return t.mutation(m.createDraftTerms, {
      ...ids.owner,
      source: { type: "worker_job", jobId },
      currency: "USD",
      lines: [
        {
          lineId: "work",
          recipient: { type: "worker", userId: recipient },
          amountCents,
          basis: "Approved per-job compensation",
        },
      ],
    });
  }
  async function approve(termsId: Id<"outgoingTerms">) {
    return t.mutation(internal.outgoingMutations.approveAndMaterialize, {
      termsId,
      approverUserId: ids.owner.userId,
      expectedRevision: 1,
    });
  }
  async function obligation(
    amountCents = 30000,
    recipient = ids.worker.userId,
  ) {
    // A separate genuine source for each obligation; never use a legacy financial row.
    const jobId = await t.run((ctx) =>
      ctx.db.insert("jobs", {
        companyId: ids.company,
        cleanerIds: [recipient],
        approvedExecutionSequence: 1,
        executionHistory: [
          {
            sequence: 1,
            provenance: "submission_confirmed",
            confirmedById: recipient,
            confirmedAt: 1,
            scheduledDate: "2026-09-01",
            workers: [
              { userId: recipient, displayName: "worker", role: "cleaner" },
            ],
          },
        ],
        type: "standard",
        status: "approved",
        scheduledDate: "2026-09-01",
        durationMinutes: 60,
        reworkCount: 0,
      }),
    );
    return (await approve(await draft(amountCents, recipient, jobId)))[0];
  }
  async function record(
    amountCents: number,
    idempotencyKey = "payment-1",
    extra: Partial<FunctionArgs<typeof m.recordOutsideSettlement>> = {},
  ) {
    return t.mutation(m.recordOutsideSettlement, {
      ...ids.owner,
      recipient: { type: "worker", userId: ids.worker.userId },
      currency: "USD",
      amountCents,
      paymentDate: "2026-09-01",
      method: "zelle",
      idempotencyKey,
      ...extra,
    });
  }
  async function state(id: Id<"outgoingObligations">) {
    return (
      await t.query(q.getObligationDetail, { ...ids.owner, obligationId: id })
    ).obligation;
  }
  async function financialRows() {
    return t.run(async (ctx) => ({
      obligations: await ctx.db.query("outgoingObligations").collect(),
      settlements: await ctx.db.query("outgoingSettlements").collect(),
      allocations: await ctx.db
        .query("outgoingSettlementAllocations")
        .collect(),
      events: await ctx.db.query("outgoingEvents").collect(),
    }));
  }
  async function assertEvidence() {
    await t.run(async (ctx) => {
      const settlements = await ctx.db.query("outgoingSettlements").collect();
      const events = await ctx.db.query("outgoingEvents").collect();
      const allocations = await ctx.db
        .query("outgoingSettlementAllocations")
        .collect();
      const obligations = await ctx.db.query("outgoingObligations").collect();
      const reversed = new Set(
        events.flatMap((e) =>
          e.payload.type === "outside_settlement_reversed"
            ? [e.payload.settlementId]
            : [],
        ),
      );
      for (const s of settlements)
        expect(
          allocations
            .filter((a) => a.settlementId === s._id)
            .reduce((sum, a) => sum + a.amountCents, 0),
        ).toBe(s.amountCents);
      for (const o of obligations) {
        const adjustmentEvents = events.filter(
          (e) =>
            e.payload.type === "principal_adjusted" &&
            e.payload.obligationId === o._id,
        );
        const delta = adjustmentEvents.reduce(
          (sum, e) =>
            sum +
            (e.payload.type === "principal_adjusted"
              ? e.payload.deltaCents
              : 0),
          0,
        );
        const net = allocations
          .filter(
            (a) => a.obligationId === o._id && !reversed.has(a.settlementId),
          )
          .reduce((sum, a) => sum + a.amountCents, 0);
        expect(o.adjustmentCents).toBe(delta);
        expect(o.adjustmentCount).toBe(adjustmentEvents.length);
        expect(o.settledCents).toBe(net);
        expect(o.basePrincipalCents + delta - net).toBeGreaterThanOrEqual(0);
      }
    });
  }
  return {
    t,
    ...ids,
    draft,
    approve,
    obligation,
    record,
    state,
    financialRows,
    assertEvidence,
  };
}
function now() {
  return Date.now();
}

describe("canonical outgoing ledger", () => {
  beforeEach(() => {
    process.env.TOKEN_PEPPER = "test-token-pepper";
  });

  it("materializes once, freezes snapshots and rejects approved edits/new-version debt", async () => {
    const s = await setup();
    const termsId = await s.draft();
    const [id] = await s.approve(termsId);
    expect(await s.approve(termsId)).toEqual([id]);
    expect(await s.state(id)).toMatchObject({
      basePrincipalCents: 30000,
      outstandingCents: 30000,
      paymentState: "OWED",
      recipient: {
        userId: s.worker.userId,
        workerProfileId: s.profile,
        displayName: "worker",
      },
    });
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.worker.userId, { name: "renamed" });
      await ctx.db.patch(s.job, {
        cleanerIds: [s.coworker.userId],
        plannedCleanerPayCents: 1,
      });
    });
    expect((await s.state(id)).recipient.displayName).toBe("worker");
    await expect(
      s.t.mutation(m.updateDraftTerms, {
        ...s.owner,
        termsId,
        expectedRevision: 1,
        currency: "USD",
        lines: [
          {
            lineId: "work",
            recipient: { type: "worker", userId: s.worker.userId },
            amountCents: 1,
            basis: "change",
          },
        ],
      }),
    ).rejects.toThrow("immutable");
    await expect(s.approve(await s.draft())).rejects.toThrow(
      "already materialized",
    );
    const rows = await s.financialRows();
    expect(rows.obligations).toHaveLength(1);
    expect(rows.events).toHaveLength(2);
    await s.assertEvidence();
  });
  it("updates only draft revision and rejects stale revisions", async () => {
    const s = await setup();
    const termsId = await s.draft();
    const args = {
      ...s.owner,
      termsId,
      expectedRevision: 1,
      currency: "USD",
      lines: [
        {
          lineId: "work",
          recipient: { type: "worker" as const, userId: s.worker.userId },
          amountCents: 45000,
          basis: "new draft basis",
        },
      ],
    };
    await s.t.mutation(m.updateDraftTerms, args);
    await expect(s.t.mutation(m.updateDraftTerms, args)).rejects.toThrow(
      "Stale",
    );
    const [id] = await s.t.mutation(
      internal.outgoingMutations.approveAndMaterialize,
      { termsId, approverUserId: s.owner.userId, expectedRevision: 2 },
    );
    expect((await s.state(id)).basePrincipalCents).toBe(45000);
  });
  it.each([0, -1, 1.5, MAX_OUTGOING_CENTS + 1, Number.MAX_SAFE_INTEGER])(
    "rejects principal %s",
    async (amount) => {
      const s = await setup();
      await expect(s.draft(amount)).rejects.toThrow("Invalid integer");
    },
  );
  it("rejects unsupported currency, cross-company source/recipient and unapproved source", async () => {
    const s = await setup();
    await expect(
      s.t.mutation(m.createDraftTerms, {
        ...s.owner,
        source: { type: "worker_job", jobId: s.job },
        currency: "EUR",
        lines: [
          {
            lineId: "work",
            recipient: { type: "worker", userId: s.worker.userId },
            amountCents: 100,
            basis: "work",
          },
        ],
      }),
    ).rejects.toThrow("currency");
    await expect(s.draft(100, s.worker.userId, s.foreignJob)).rejects.toThrow(
      "Cross-company",
    );
    await expect(s.draft(100, s.foreign.userId)).rejects.toThrow(
      "worker recipient",
    );
    const termsId = await s.draft();
    await s.t.run((ctx) => ctx.db.patch(s.job, { status: "in_progress" }));
    await expect(s.approve(termsId)).rejects.toThrow("Approved source");
    expect((await s.financialRows()).obligations).toEqual([]);
  });
  it("supports partner obligations only with actual shared-source and owner acceptance evidence", async () => {
    const s = await setup();
    const termsId = await s.t.mutation(m.createDraftTerms, {
      ...s.owner,
      source: { type: "partner_shared_job", sharedJobId: s.share },
      currency: "USD",
      lines: [
        {
          lineId: "partner",
          recipient: { type: "partner_company", companyId: s.other },
          amountCents: 12000,
          basis: "Shared work terms",
        },
      ],
    });
    await expect(s.approve(termsId)).rejects.toThrow("Partner acceptance");
    const approval = {
      termsId,
      approverUserId: s.owner.userId,
      expectedRevision: 1,
      partnerAcceptance: {
        actorUserId: s.foreign.userId,
        evidence: "Explicit partner-owner approval reference",
      },
    };
    const [id] = await s.t.mutation(
      internal.outgoingMutations.approveAndMaterialize,
      approval,
    );
    expect(
      await s.t.mutation(
        internal.outgoingMutations.approveAndMaterialize,
        approval,
      ),
    ).toEqual([id]);
    expect((await s.state(id)).recipient.type).toBe("partner_company");
    const settlementId = await s.record(12000, "partner-payment", {
      recipient: { type: "partner_company", companyId: s.other },
      selectedObligationIds: [id],
    });
    expect((await s.state(id)).paymentState).toBe("PAID");
    await expect(
      s.t.query(q.getSettlementDetail, { ...s.foreign, settlementId }),
    ).rejects.toThrow("Access denied");
    await s.assertEvidence();
  });
  it("records partial settlements, then full settlement, without claiming provider verification", async () => {
    const s = await setup();
    const id = await s.obligation();
    const first = await s.record(20000);
    expect(await s.state(id)).toMatchObject({
      recordedPaidCents: 20000,
      outstandingCents: 10000,
      paymentState: "PARTIALLY_PAID",
    });
    await s.record(10000, "second");
    expect(await s.state(id)).toMatchObject({
      recordedPaidCents: 30000,
      outstandingCents: 0,
      paymentState: "PAID",
    });
    expect(
      (
        await s.t.query(q.getSettlementDetail, {
          ...s.owner,
          settlementId: first,
        })
      ).settlement.provenance,
    ).toBe("outside_declared");
    await s.assertEvidence();
  });
  it("allocates oldest-first with stable ID ties, and supports a restricted selection", async () => {
    const s = await setup();
    const a = await s.obligation(10000);
    const b = await s.obligation(10000);
    const c = await s.obligation(10000);
    await s.t.run(async (ctx) => {
      await ctx.db.patch(a, { approvedAt: 100 });
      await ctx.db.patch(b, { approvedAt: 100 });
      await ctx.db.patch(c, { approvedAt: 200 });
    });
    const first = await s.record(15000);
    const allocation = (
      await s.t.query(q.getSettlementDetail, {
        ...s.owner,
        settlementId: first,
      })
    ).allocations;
    expect(allocation.map((a) => a.obligationId)).toEqual([a, b].sort());
    expect(allocation.map((a) => a.amountCents)).toEqual([10000, 5000]);
    await s.record(10000, "selected", { selectedObligationIds: [c] });
    expect((await s.state(c)).outstandingCents).toBe(0);
    await s.assertEvidence();
  });
  it("same key/content returns original even after reversal; mismatched content rejects", async () => {
    const s = await setup();
    const id = await s.obligation();
    const settlementId = await s.record(10000);
    expect(await s.record(10000)).toBe(settlementId);
    const before = await s.financialRows();
    await expect(s.record(11000)).rejects.toThrow("Idempotency");
    await expect(
      s.record(10000, "payment-1", { administrativeNote: "different" }),
    ).rejects.toThrow("Idempotency");
    expect(await s.financialRows()).toEqual(before);
    await s.t.mutation(m.reverseOutsideSettlement, {
      ...s.owner,
      settlementId,
      reason: "Incorrect declaration",
      idempotencyKey: "reverse",
    });
    expect(await s.record(10000)).toBe(settlementId);
    expect((await s.state(id)).outstandingCents).toBe(30000);
    await s.assertEvidence();
  });
  it.each([0, -1, 1.2, MAX_OUTGOING_CENTS + 1])(
    "rejects settlement amount %s atomically",
    async (amount) => {
      const s = await setup();
      await s.obligation();
      const before = await s.financialRows();
      await expect(s.record(amount)).rejects.toThrow();
      expect(await s.financialRows()).toEqual(before);
    },
  );
  it("rejects overpayment, duplicate IDs, cross-recipient, cross-company and mixed currency", async () => {
    const s = await setup();
    const id = await s.obligation(10000);
    const coworker = await s.obligation(10000, s.coworker.userId);
    const before = await s.financialRows();
    await expect(s.record(20000)).rejects.toThrow("exceeds");
    await expect(
      s.record(100, "dup", { selectedObligationIds: [id, id] }),
    ).rejects.toThrow("duplicate");
    await expect(
      s.record(100, "mixed", { selectedObligationIds: [id, coworker] }),
    ).rejects.toThrow("mismatch");
    await expect(
      s.record(100, "foreign", { ...s.foreign, selectedObligationIds: [id] }),
    ).rejects.toThrow("Access denied");
    await expect(s.record(100, "eur", { currency: "EUR" })).rejects.toThrow(
      "currency",
    );
    expect(await s.financialRows()).toEqual(before);
    // Defensive evidence-validation test: a future non-USD record must not be mixed.
    await s.t.run((ctx) => ctx.db.patch(id, { currency: "EUR" }));
    await expect(
      s.record(100, "mixed-currency", { selectedObligationIds: [id] }),
    ).rejects.toThrow("mismatch");
  });
  it("validates exact allocation sums/versions and rolls back the entire request", async () => {
    const s = await setup();
    const a = await s.obligation(10000);
    const b = await s.obligation(10000);
    const before = await s.financialRows();
    await expect(
      s.record(10000, "sum", {
        allocations: [
          { obligationId: a, amountCents: 5000, expectedVersion: 1 },
        ],
      }),
    ).rejects.toThrow("sum mismatch");
    await expect(
      s.record(10000, "stale", {
        allocations: [
          { obligationId: a, amountCents: 5000, expectedVersion: 1 },
          { obligationId: b, amountCents: 5000, expectedVersion: 0 },
        ],
      }),
    ).rejects.toThrow("Stale");
    await expect(
      s.record(20000, "over", {
        allocations: [
          { obligationId: a, amountCents: 20000, expectedVersion: 1 },
        ],
      }),
    ).rejects.toThrow("exceeds");
    expect(await s.financialRows()).toEqual(before);
    await s.record(10000, "exact", {
      allocations: [
        { obligationId: a, amountCents: 6000, expectedVersion: 1 },
        { obligationId: b, amountCents: 4000, expectedVersion: 1 },
      ],
    });
    expect((await s.state(a)).outstandingCents).toBe(4000);
    expect((await s.state(b)).outstandingCents).toBe(6000);
    await expect(
      s.record(100, "stale-later", {
        allocations: [
          { obligationId: a, amountCents: 100, expectedVersion: 1 },
        ],
      }),
    ).rejects.toThrow("Stale");
    await s.assertEvidence();
  });
  it("simultaneous submissions cannot both spend the same outstanding", async () => {
    const s = await setup();
    const id = await s.obligation(10000);
    const results = await Promise.allSettled([
      s.record(8000, "concurrent-a"),
      s.record(8000, "concurrent-b"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await s.state(id)).outstandingCents).toBe(2000);
    expect((await s.financialRows()).settlements).toHaveLength(1);
    await s.assertEvidence();
  });
  it("concurrent same-key submissions create one settlement", async () => {
    const s = await setup();
    await s.obligation();
    const ids = await Promise.all([s.record(10000), s.record(10000)]);
    expect(ids[0]).toBe(ids[1]);
    expect((await s.financialRows()).settlements).toHaveLength(1);
    await s.assertEvidence();
  });
  it("adds correction after full payment; adjusts down only above net settlement", async () => {
    const s = await setup();
    const id = await s.obligation(10000);
    await s.record(10000);
    const args = {
      ...s.owner,
      obligationId: id,
      deltaCents: 2000,
      reason: "Approved extra work",
      expectedVersion: 2,
      idempotencyKey: "adjust",
    };
    const eventId = await s.t.mutation(m.adjustObligation, args);
    expect(await s.t.mutation(m.adjustObligation, args)).toBe(eventId);
    expect(await s.state(id)).toMatchObject({
      basePrincipalCents: 10000,
      adjustmentCents: 2000,
      outstandingCents: 2000,
      paymentState: "PARTIALLY_PAID",
      adjusted: true,
    });
    await expect(
      s.t.mutation(m.adjustObligation, {
        ...args,
        deltaCents: -3000,
        expectedVersion: 3,
        idempotencyKey: "invalid-negative",
      }),
    ).rejects.toThrow("below recorded");
    await s.t.mutation(m.adjustObligation, {
      ...args,
      deltaCents: -2000,
      expectedVersion: 3,
      idempotencyKey: "negative",
    });
    expect(await s.state(id)).toMatchObject({
      basePrincipalCents: 10000,
      adjustmentCents: 0,
      outstandingCents: 0,
      paymentState: "PAID",
      adjusted: true,
    });
    await s.assertEvidence();
  });
  it("accepts $100 - $10 after $80 paid and requires a correction reason", async () => {
    const s = await setup();
    const id = await s.obligation(10000);
    await s.record(8000);
    const args = {
      ...s.owner,
      obligationId: id,
      deltaCents: -1000,
      reason: "Approved correction",
      expectedVersion: 2,
      idempotencyKey: "adjust",
    };
    await expect(
      s.t.mutation(m.adjustObligation, { ...args, reason: " " }),
    ).rejects.toThrow("reason");
    await s.t.mutation(m.adjustObligation, args);
    expect((await s.state(id)).outstandingCents).toBe(1000);
    await s.assertEvidence();
  });
  it("voids unpaid debt with append-only evidence but not partially/full-paid debt", async () => {
    const s = await setup();
    const unpaid = await s.obligation(10000);
    const paid = await s.obligation(10000);
    const partial = await s.obligation(10000);
    await s.record(10000, "paid", { selectedObligationIds: [paid] });
    await s.record(5000, "partial", { selectedObligationIds: [partial] });
    const args = {
      ...s.owner,
      obligationId: unpaid,
      expectedVersion: 1,
      reason: "Duplicate approved source canceled",
      idempotencyKey: "void",
    };
    const id = await s.t.mutation(m.voidObligation, args);
    expect(await s.t.mutation(m.voidObligation, args)).toBe(id);
    expect(await s.state(unpaid)).toMatchObject({
      basePrincipalCents: 10000,
      lifecycle: "VOIDED",
      collectibleOutstandingCents: 0,
    });
    for (const obligationId of [paid, partial])
      await expect(
        s.t.mutation(m.voidObligation, {
          ...args,
          obligationId,
          expectedVersion: 2,
          idempotencyKey: `void-${obligationId}`,
        }),
      ).rejects.toThrow("unsettled");
    await expect(
      s.record(100, "voided-pay", { selectedObligationIds: [unpaid] }),
    ).rejects.toThrow("Voided");
    expect((await s.financialRows()).obligations).toHaveLength(3);
    await s.assertEvidence();
  });
  it("reverses a multi-obligation declaration exactly once and permits replacement payment", async () => {
    const s = await setup();
    const a = await s.obligation(10000);
    const b = await s.obligation(10000);
    const settlementId = await s.record(15000);
    const original = (await s.financialRows()).settlements[0];
    const allocations = (await s.financialRows()).allocations;
    const args = {
      ...s.owner,
      settlementId,
      reason: "Declaration entered incorrectly; external payment unchanged",
      idempotencyKey: "reverse",
    };
    const id = await s.t.mutation(m.reverseOutsideSettlement, args);
    expect(await s.t.mutation(m.reverseOutsideSettlement, args)).toBe(id);
    await expect(
      s.t.mutation(m.reverseOutsideSettlement, {
        ...args,
        idempotencyKey: "reverse-again",
      }),
    ).rejects.toThrow("already reversed");
    expect((await s.financialRows()).settlements[0]).toEqual(original);
    expect((await s.financialRows()).allocations).toEqual(allocations);
    expect((await s.state(a)).outstandingCents).toBe(10000);
    expect((await s.state(b)).outstandingCents).toBe(10000);
    await s.record(20000, "replacement");
    expect((await s.state(a)).paymentState).toBe("PAID");
    await s.assertEvidence();
  });
  it("recipient history uses frozen identity and hides private notes/fingerprints/coworker terms", async () => {
    const s = await setup();
    const id = await s.obligation(10000);
    const coworker = await s.obligation(10000, s.coworker.userId);
    const settlementId = await s.record(5000, "private", {
      administrativeNote: "OWNER-PRIVATE",
      publicReference: "public-reference",
    });
    await s.t.run(async (ctx) => {
      const obligation = await ctx.db.get(id);
      if (obligation?.source.type === "worker_job")
        await ctx.db.patch(obligation.source.jobId, {
          cleanerIds: [s.coworker.userId],
        });
    });
    const history = await s.t.query(q.listRecipientHistory, {
      ...s.worker,
      paginationOpts: page,
    });
    expect(history.page).toHaveLength(1);
    expect(history.page[0]._id).toBe(id);
    const detail = await s.t.query(q.getObligationDetail, {
      ...s.worker,
      obligationId: id,
    });
    const payment = await s.t.query(q.getSettlementDetail, {
      ...s.worker,
      settlementId,
    });
    expect(JSON.stringify(detail)).not.toContain("OWNER-PRIVATE");
    expect(JSON.stringify(payment)).not.toContain("OWNER-PRIVATE");
    expect(payment.settlement).not.toHaveProperty("requestFingerprint");
    expect(payment.settlement).not.toHaveProperty("administrativeNote");
    expect(payment.settlement.publicReference).toBe("public-reference");
    await expect(
      s.t.query(q.getObligationDetail, { ...s.worker, obligationId: coworker }),
    ).rejects.toThrow();
    await expect(
      s.t.query(q.listRecipientHistory, {
        ...s.worker,
        recipient: { type: "worker", userId: s.coworker.userId },
        paginationOpts: page,
      }),
    ).rejects.toThrow();
    expect(
      await s.t.query(q.recipientOutstandingTotals, s.worker),
    ).toMatchObject({
      currency: "USD",
      outstandingCents: 5000,
      recordedPaidCents: 5000,
    });
  });
  it("enforces owner writes, manager financial-read capability and all tenant/session boundaries", async () => {
    const s = await setup();
    const id = await s.obligation();
    expect(
      (
        await s.t.query(q.listCompanyObligations, {
          ...s.manager,
          paginationOpts: page,
        })
      ).page,
    ).toHaveLength(1);
    await expect(
      s.t.query(q.listCompanyObligations, {
        ...s.restricted,
        paginationOpts: page,
      }),
    ).rejects.toThrow("canViewFinancials");
    for (const actor of [s.manager, s.restricted, s.worker]) {
      await expect(s.record(100, "no-write", actor)).rejects.toThrow("Owner");
      await expect(
        s.t.mutation(m.adjustObligation, {
          ...actor,
          obligationId: id,
          deltaCents: 100,
          reason: "test",
          expectedVersion: 1,
          idempotencyKey: "no-adjust",
        }),
      ).rejects.toThrow("Owner");
      await expect(
        s.t.mutation(m.voidObligation, {
          ...actor,
          obligationId: id,
          reason: "test",
          expectedVersion: 1,
          idempotencyKey: "no-void",
        }),
      ).rejects.toThrow("Owner");
    }
    await expect(
      s.t.query(q.getObligationDetail, { ...s.foreign, obligationId: id }),
    ).rejects.toThrow("Access denied");
    await expect(
      s.record(100, "bad-session", { sessionToken: "" }),
    ).rejects.toThrow("session");
    await expect(
      s.t.query(q.listRecipientHistory, {
        ...s.worker,
        userId: s.coworker.userId,
        paginationOpts: page,
      }),
    ).rejects.toThrow("principal");
  });
  it("never materializes legacy rows or installs an electronic rail/public materializer", async () => {
    const s = await setup();
    expect((await s.financialRows()).obligations).toEqual([]);
    expect(
      (
        await s.t.query(q.listCompanyObligations, {
          ...s.owner,
          paginationOpts: page,
        })
      ).page,
    ).toEqual([]);
    await expect(
      s.t.mutation(api.mutations.jobs.updatePlannedCleanerPay, {
        ...s.owner,
        jobId: s.job,
        amountCents: 100,
      }),
    ).rejects.toThrow("retired");
    const implementation = readFileSync("convex/outgoingMutations.ts", "utf8");
    expect(implementation).toContain(
      "approveAndMaterialize = internalMutation",
    );
    for (const forbidden of [
      "cleanerPayments",
      "companySettlements",
      "plannedCleanerPayCents",
      "stripe",
      "fetch(",
      "transfers.create",
    ])
      expect(implementation).not.toContain(forbidden);
  });

  it("concurrent approval retries materialize one set of obligations/events", async () => {
    const s = await setup();
    const termsId = await s.draft();
    const results = await Promise.all([s.approve(termsId), s.approve(termsId)]);
    expect(results[0]).toEqual(results[1]);
    expect((await s.financialRows()).obligations).toHaveLength(1);
    expect((await s.financialRows()).events).toHaveLength(2);
  });

  it("canonicalizes allocation order/object property order and protects the shared command-key namespace", async () => {
    const s = await setup();
    const a = await s.obligation(10000);
    const b = await s.obligation(10000);
    const first = await s.record(10000, "canonical", {
      allocations: [
        { obligationId: a, amountCents: 6000, expectedVersion: 1 },
        { obligationId: b, amountCents: 4000, expectedVersion: 1 },
      ],
    });
    expect(
      await s.record(10000, "canonical", {
        allocations: [
          { expectedVersion: 1, amountCents: 4000, obligationId: b },
          { expectedVersion: 1, amountCents: 6000, obligationId: a },
        ],
      }),
    ).toBe(first);
    await expect(
      s.t.mutation(m.adjustObligation, {
        ...s.owner,
        obligationId: a,
        deltaCents: 100,
        reason: "approved correction",
        expectedVersion: 2,
        idempotencyKey: "canonical",
      }),
    ).rejects.toThrow("Idempotency");
    await s.t.mutation(m.adjustObligation, {
      ...s.owner,
      obligationId: a,
      deltaCents: 100,
      reason: "approved correction",
      expectedVersion: 2,
      idempotencyKey: "adjustment-key",
    });
    await expect(s.record(100, "adjustment-key")).rejects.toThrow(
      "Idempotency",
    );
    await s.assertEvidence();
  });

  it("rejects malformed dates, oversized inputs, invalid allocation amounts and ambiguous policies atomically", async () => {
    const s = await setup();
    const id = await s.obligation(10000);
    const before = await s.financialRows();
    for (const paymentDate of ["2026-02-30", "09/01/2026", "", "2026-13-01"])
      await expect(
        s.record(100, "invalid-date", { paymentDate }),
      ).rejects.toThrow("date");
    await expect(
      s.record(100, "oversized", {
        selectedObligationIds: Array(101).fill(id),
      }),
    ).rejects.toThrow("selected");
    for (const amountCents of [0, -1, 1.5])
      await expect(
        s.record(100, "invalid-allocation", {
          allocations: [{ obligationId: id, amountCents, expectedVersion: 1 }],
        }),
      ).rejects.toThrow("integer");
    await expect(
      s.record(100, "ambiguous", {
        selectedObligationIds: [id],
        allocations: [
          { obligationId: id, amountCents: 100, expectedVersion: 1 },
        ],
      }),
    ).rejects.toThrow("Choose");
    expect(await s.financialRows()).toEqual(before);
  });

  it("requires bounded nonzero adjustments, current versions and reasons for void/reversal", async () => {
    const s = await setup();
    const id = await s.obligation(10000);
    for (const deltaCents of [0, 1.5, MAX_OUTGOING_CENTS + 1])
      await expect(
        s.t.mutation(m.adjustObligation, {
          ...s.owner,
          obligationId: id,
          deltaCents,
          reason: "correction",
          expectedVersion: 1,
          idempotencyKey: "bad-adjust",
        }),
      ).rejects.toThrow("integer");
    await expect(
      s.t.mutation(m.adjustObligation, {
        ...s.owner,
        obligationId: id,
        deltaCents: MAX_OUTGOING_CENTS,
        reason: "correction",
        expectedVersion: 1,
        idempotencyKey: "bounds",
      }),
    ).rejects.toThrow("bounds");
    await expect(
      s.t.mutation(m.voidObligation, {
        ...s.owner,
        obligationId: id,
        reason: "",
        expectedVersion: 1,
        idempotencyKey: "void",
      }),
    ).rejects.toThrow("reason");
    await expect(
      s.t.mutation(m.voidObligation, {
        ...s.owner,
        obligationId: id,
        reason: "correction",
        expectedVersion: 0,
        idempotencyKey: "void",
      }),
    ).rejects.toThrow("Stale");
    const settlementId = await s.record(100);
    await expect(
      s.t.mutation(m.reverseOutsideSettlement, {
        ...s.owner,
        settlementId,
        reason: " ",
        idempotencyKey: "reverse",
      }),
    ).rejects.toThrow("reason");
    await s.assertEvidence();
  });

  it("retains worker history after role/name changes and prevents all unauthorized draft/reversal/detail operations", async () => {
    const s = await setup();
    const id = await s.obligation(10000);
    const settlementId = await s.record(1000);
    const termsId = await s.draft();
    for (const actor of [s.worker, s.manager, s.restricted]) {
      await expect(
        s.t.mutation(m.createDraftTerms, {
          ...actor,
          source: { type: "worker_job", jobId: s.job },
          currency: "USD",
          lines: [
            {
              lineId: "work",
              recipient: { type: "worker", userId: s.worker.userId },
              amountCents: 100,
              basis: "work",
            },
          ],
        }),
      ).rejects.toThrow("Owner");
      await expect(
        s.t.mutation(m.updateDraftTerms, {
          ...actor,
          termsId,
          expectedRevision: 1,
          currency: "USD",
          lines: [],
        }),
      ).rejects.toThrow("Owner");
      await expect(
        s.t.mutation(m.reverseOutsideSettlement, {
          ...actor,
          settlementId,
          reason: "correction",
          idempotencyKey: "unauthorized",
        }),
      ).rejects.toThrow("Owner");
    }
    await expect(
      s.t.query(q.getTerms, { ...s.worker, termsId }),
    ).rejects.toThrow();
    await expect(
      s.t.query(q.getSettlementDetail, { ...s.foreign, settlementId }),
    ).rejects.toThrow("Access denied");
    await expect(
      s.t.mutation(m.reverseOutsideSettlement, {
        ...s.foreign,
        settlementId,
        reason: "correction",
        idempotencyKey: "foreign",
      }),
    ).rejects.toThrow("Access denied");
    await s.t.run((ctx) =>
      ctx.db.patch(s.worker.userId, { role: "owner", name: "renamed" }),
    );
    const history = await s.t.query(q.listRecipientHistory, {
      ...s.worker,
      paginationOpts: page,
    });
    expect(history.page[0].recipient.displayName).toBe("worker");
    expect(history.page[0]._id).toBe(id);
    await expect(
      s.t.query(q.getObligationDetail, {
        ...s.worker,
        sessionToken: "",
        obligationId: id,
      }),
    ).rejects.toThrow("session");
  });

  it("rejects duplicate terms lines and mismatched source/recipient families", async () => {
    const s = await setup();
    const line = {
      lineId: "work",
      recipient: { type: "worker" as const, userId: s.worker.userId },
      amountCents: 100,
      basis: "work",
    };
    await expect(
      s.t.mutation(m.createDraftTerms, {
        ...s.owner,
        source: { type: "worker_job", jobId: s.job },
        currency: "USD",
        lines: [line, line],
      }),
    ).rejects.toThrow("Duplicate");
    await expect(
      s.t.mutation(m.createDraftTerms, {
        ...s.owner,
        source: { type: "partner_shared_job", sharedJobId: s.share },
        currency: "USD",
        lines: [line],
      }),
    ).rejects.toThrow("mismatch");
    await expect(
      s.t.mutation(m.createDraftTerms, {
        ...s.owner,
        source: { type: "worker_job", jobId: s.job },
        currency: "USD",
        lines: [
          {
            ...line,
            recipient: { type: "partner_company", companyId: s.other },
          },
        ],
      }),
    ).rejects.toThrow("mismatch");
  });
});
