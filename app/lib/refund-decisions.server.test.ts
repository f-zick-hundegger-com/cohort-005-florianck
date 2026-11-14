import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { RefundPaymentStatus, RefundStatus, UserRole } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  createRefundDecisions,
  RefundDecisionError,
  type EmailMessage,
} from "./refund-decisions.server";
import type {
  PaymentProvider,
  StartRefundPaymentInput,
} from "./payment-provider.server";

const NOW = new Date("2026-03-10T12:00:00.000Z");

function setup() {
  const db = createTestDb();
  const base = seedBaseData(db);
  const sent: EmailMessage[] = [];
  // A fake Payment Provider: it only records what it was asked to start. The
  // test fires confirmations by hand through decisions.handleConfirmation.
  const started: StartRefundPaymentInput[] = [];
  const paymentProvider: PaymentProvider = {
    name: "fake-pay",
    async start(input) {
      started.push(input);
      return { reference: `fake_ref_${input.refundPaymentId}` };
    },
  };
  const decisions = createRefundDecisions({
    db,
    sendEmail: (message) => {
      sent.push(message);
    },
    now: () => NOW,
    paymentProvider,
  });

  const admin = db
    .insert(schema.users)
    .values({ name: "Ada Admin", email: "admin@example.com", role: UserRole.Admin })
    .returning()
    .get();
  const otherInstructor = db
    .insert(schema.users)
    .values({
      name: "Other Instructor",
      email: "other@example.com",
      role: UserRole.Instructor,
    })
    .returning()
    .get();

  function requestRefund(
    overrides: { userId?: number; courseId?: number; requestedAt?: string } = {}
  ) {
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: overrides.userId ?? base.user.id,
        courseId: overrides.courseId ?? base.course.id,
        amountPaid: 4900,
        country: "US",
      })
      .returning()
      .get();
    return db
      .insert(schema.refunds)
      .values({
        purchaseId: purchase.id,
        reason: "It was not what I expected.",
        requestedAt: overrides.requestedAt,
      })
      .returning()
      .get();
  }

  function readRefund(id: number) {
    return db.select().from(schema.refunds).where(eq(schema.refunds.id, id)).get();
  }

  return { db, base, sent, started, decisions, admin, otherInstructor, requestRefund, readRefund };
}

describe("listing Requested Refunds", () => {
  it("shows an admin every Requested Refund, oldest first", () => {
    const { decisions, admin, requestRefund } = setup();
    const newer = requestRefund({ requestedAt: "2026-03-05T00:00:00.000Z" });
    const older = requestRefund({ requestedAt: "2026-03-01T00:00:00.000Z" });

    const rows = decisions.listRequested(admin.id);

    expect(rows.map((row) => row.refundId)).toEqual([older.id, newer.id]);
    expect(rows[0]).toMatchObject({
      learnerName: "Test User",
      amountPaid: 4900,
      reason: "It was not what I expected.",
    });
  });

  it("leaves out Refunds that are already decided", () => {
    const { decisions, admin, requestRefund, db } = setup();
    const decided = requestRefund();
    db.update(schema.refunds)
      .set({ status: RefundStatus.Declined })
      .where(eq(schema.refunds.id, decided.id))
      .run();

    expect(decisions.listRequested(admin.id)).toEqual([]);
  });

  it("shows an instructor only Refunds on courses they own", () => {
    const { decisions, base, otherInstructor, requestRefund, db } = setup();
    const mine = requestRefund();
    const otherCourse = db
      .insert(schema.courses)
      .values({
        title: "Other course",
        slug: "other-course",
        description: "Other",
        salesCopy: "Other",
        instructorId: otherInstructor.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();
    requestRefund({ courseId: otherCourse.id });

    const rows = decisions.listRequested(base.instructor.id);

    expect(rows.map((row) => row.refundId)).toEqual([mine.id]);
  });

  it("refuses a learner", () => {
    const { decisions, base } = setup();
    expect(() => decisions.listRequested(base.user.id)).toThrow(RefundDecisionError);
  });

  it("shows what the learner has watched today next to the request-time numbers", () => {
    const { decisions, admin, base, requestRefund, db } = setup();
    const refund = requestRefund();
    db.update(schema.refunds)
      .set({ secondsWatchedAtRequest: 600, completionAtRequest: 0.25 })
      .where(eq(schema.refunds.id, refund.id))
      .run();
    const mod = db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "M", position: 1 })
      .returning()
      .get();
    const lesson = db
      .insert(schema.lessons)
      .values({ moduleId: mod.id, title: "L", position: 1 })
      .returning()
      .get();
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId: lesson.id,
        eventType: "pause",
        positionSeconds: 900,
      })
      .run();

    const [row] = decisions.listRequested(admin.id);

    expect(row).toMatchObject({
      secondsWatchedAtRequest: 600,
      completionAtRequest: 0.25,
      current: { secondsWatched: 900, completion: 0 },
    });
  });
});

describe("declining a Refund", () => {
  it("records the decider, time and reason, and emails the learner the reason", async () => {
    const { decisions, admin, base, sent, requestRefund, readRefund } = setup();
    const refund = requestRefund();

    await decisions.decline(admin.id, refund.id, "You watched most of it.");

    expect(readRefund(refund.id)).toMatchObject({
      status: RefundStatus.Declined,
      declineReason: "You watched most of it.",
      resolvedByUserId: admin.id,
      resolvedAt: NOW.toISOString(),
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("test@example.com");
    expect(sent[0].body).toContain("You watched most of it.");
    expect(base.user.id).toBeGreaterThan(0);
  });

  it("lets the owning instructor decline", async () => {
    const { decisions, base, requestRefund, readRefund } = setup();
    const refund = requestRefund();

    await decisions.decline(base.instructor.id, refund.id, "Outside our policy.");

    expect(readRefund(refund.id)?.status).toBe(RefundStatus.Declined);
  });

  it("refuses a missing or blank reason", async () => {
    const { decisions, admin, requestRefund, readRefund, sent } = setup();
    const refund = requestRefund();

    await expect(decisions.decline(admin.id, refund.id, "   ")).rejects.toMatchObject({
      status: 400,
    });

    expect(readRefund(refund.id)?.status).toBe(RefundStatus.Requested);
    expect(sent).toEqual([]);
  });

  it("refuses an instructor who does not own the course", async () => {
    const { decisions, otherInstructor, requestRefund, readRefund } = setup();
    const refund = requestRefund();

    await expect(
      decisions.decline(otherInstructor.id, refund.id, "Nope.")
    ).rejects.toMatchObject({ status: 403 });

    expect(readRefund(refund.id)?.status).toBe(RefundStatus.Requested);
  });

  it("refuses an admin deciding on their own Purchase", async () => {
    const { decisions, admin, requestRefund, readRefund } = setup();
    const refund = requestRefund({ userId: admin.id });

    await expect(
      decisions.decline(admin.id, refund.id, "Nope.")
    ).rejects.toMatchObject({ status: 403 });

    expect(readRefund(refund.id)?.status).toBe(RefundStatus.Requested);
  });

  it("refuses a learner", async () => {
    const { decisions, base, requestRefund } = setup();
    const refund = requestRefund();

    await expect(
      decisions.decline(base.user.id, refund.id, "Nope.")
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a Refund that does not exist", async () => {
    const { decisions, admin } = setup();

    await expect(decisions.decline(admin.id, 999, "Nope.")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("refuses a second decision on the same Refund", async () => {
    const { decisions, admin, requestRefund, readRefund, sent } = setup();
    const refund = requestRefund();
    await decisions.decline(admin.id, refund.id, "First reason.");

    await expect(
      decisions.decline(admin.id, refund.id, "Second reason.")
    ).rejects.toMatchObject({ status: 409 });

    expect(readRefund(refund.id)?.declineReason).toBe("First reason.");
    expect(sent).toHaveLength(1);
  });
});

describe("approving a Refund", () => {
  function approvable() {
    const ctx = setup();
    const refund = ctx.requestRefund();
    const purchase = ctx.db.select().from(schema.purchases).get();
    if (!purchase) throw new Error("expected a purchase");
    ctx.db
      .insert(schema.enrollments)
      .values({ userId: ctx.base.user.id, courseId: ctx.base.course.id })
      .run();
    return { ...ctx, refund, purchase };
  }

  it("records the decider, time and the full amount paid, and emails the learner", async () => {
    const { decisions, admin, refund, readRefund, sent } = approvable();

    await decisions.approve(admin.id, refund.id);

    expect(readRefund(refund.id)).toMatchObject({
      status: RefundStatus.Approved,
      amountRefunded: 4900,
      resolvedByUserId: admin.id,
      resolvedAt: NOW.toISOString(),
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("test@example.com");
    expect(sent[0].subject).toContain("approved");
  });

  it("lets the owning instructor approve", async () => {
    const { decisions, base, refund, readRefund } = approvable();

    await decisions.approve(base.instructor.id, refund.id);

    expect(readRefund(refund.id)?.status).toBe(RefundStatus.Approved);
  });

  it("removes the learner's enrollment but keeps lesson progress and watch events", async () => {
    const { decisions, admin, refund, base, db } = approvable();
    const mod = db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "M", position: 1 })
      .returning()
      .get();
    const lesson = db
      .insert(schema.lessons)
      .values({ moduleId: mod.id, title: "L", position: 1 })
      .returning()
      .get();
    db.insert(schema.lessonProgress)
      .values({
        userId: base.user.id,
        lessonId: lesson.id,
        status: schema.LessonProgressStatus.Completed,
      })
      .run();
    db.insert(schema.videoWatchEvents)
      .values({
        userId: base.user.id,
        lessonId: lesson.id,
        eventType: "pause",
        positionSeconds: 30,
      })
      .run();

    await decisions.approve(admin.id, refund.id);

    expect(db.select().from(schema.enrollments).all()).toEqual([]);
    expect(db.select().from(schema.lessonProgress).all()).toHaveLength(1);
    expect(db.select().from(schema.videoWatchEvents).all()).toHaveLength(1);
  });

  it("leaves other learners' enrollments in the course alone", async () => {
    const { decisions, admin, refund, base, db } = approvable();
    const other = db
      .insert(schema.users)
      .values({ name: "Other", email: "o@example.com", role: UserRole.Student })
      .returning()
      .get();
    db.insert(schema.enrollments)
      .values({ userId: other.id, courseId: base.course.id })
      .run();

    await decisions.approve(admin.id, refund.id);

    expect(db.select().from(schema.enrollments).all()).toHaveLength(1);
  });

  it("voids unclaimed coupon codes but not claimed ones", async () => {
    const { decisions, admin, refund, base, purchase, db } = approvable();
    const team = db
      .insert(schema.teams)
      .values({})
      .returning()
      .get();
    const addCoupon = (code: string, redeemedAt: string | null) =>
      db
        .insert(schema.coupons)
        .values({
          teamId: team.id,
          courseId: base.course.id,
          code,
          purchaseId: purchase.id,
          redeemedByUserId: redeemedAt ? base.user.id : null,
          redeemedAt,
        })
        .run();
    addCoupon("UNCLAIMED", null);
    addCoupon("CLAIMED", "2026-03-01T00:00:00.000Z");

    await decisions.approve(admin.id, refund.id);

    const byCode = Object.fromEntries(
      db
        .select()
        .from(schema.coupons)
        .all()
        .map((c) => [c.code, c.voidedAt])
    );
    expect(byCode.UNCLAIMED).toBe(NOW.toISOString());
    expect(byCode.CLAIMED).toBeNull();
  });

  it("refuses a second decision, in either direction", async () => {
    const { decisions, admin, refund, sent } = approvable();
    await decisions.approve(admin.id, refund.id);

    await expect(decisions.approve(admin.id, refund.id)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      decisions.decline(admin.id, refund.id, "Too late.")
    ).rejects.toMatchObject({ status: 409 });
    expect(sent).toHaveLength(1);
  });

  it("refuses an instructor who does not own the course, and an admin on their own Purchase", async () => {
    const { decisions, otherInstructor, admin, requestRefund, refund, readRefund } =
      approvable();
    const own = requestRefund({ userId: admin.id });

    await expect(
      decisions.approve(otherInstructor.id, refund.id)
    ).rejects.toMatchObject({ status: 403 });
    await expect(decisions.approve(admin.id, own.id)).rejects.toMatchObject({
      status: 403,
    });
    expect(readRefund(refund.id)?.status).toBe(RefundStatus.Requested);
    expect(readRefund(own.id)?.status).toBe(RefundStatus.Requested);
  });

  it("creates a pending Refund Payment and starts it with an idempotency key", async () => {
    const { decisions, admin, refund, db, started } = approvable();

    await decisions.approve(admin.id, refund.id);

    const payments = db.select().from(schema.refundPayments).all();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      refundId: refund.id,
      provider: "fake-pay",
      status: RefundPaymentStatus.Pending,
      confirmedAt: null,
    });
    expect(payments[0].idempotencyKey).not.toBe("");
    expect(started).toEqual([
      {
        amount: 4900,
        idempotencyKey: payments[0].idempotencyKey,
        refundPaymentId: payments[0].id,
      },
    ]);
  });

  it("does not wait for the provider to start the payment", async () => {
    const ctx = approvable();
    const decisions = createRefundDecisions({
      db: ctx.db,
      sendEmail: () => {},
      now: () => NOW,
      paymentProvider: { name: "slow", start: () => new Promise(() => {}) },
    });

    await decisions.approve(ctx.admin.id, ctx.refund.id);

    expect(ctx.readRefund(ctx.refund.id)?.status).toBe(RefundStatus.Approved);
  });

  it("approves even when the Refund Window has closed", async () => {
    const { decisions, admin, db, refund, purchase, readRefund } = approvable();
    db.update(schema.purchases)
      .set({ createdAt: "2025-01-01T00:00:00.000Z" })
      .where(eq(schema.purchases.id, purchase.id))
      .run();

    await decisions.approve(admin.id, refund.id);

    expect(readRefund(refund.id)?.status).toBe(RefundStatus.Approved);
  });
});
