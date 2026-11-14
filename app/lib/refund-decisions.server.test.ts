import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  createRefundDecisions,
  RefundDecisionError,
  type EmailMessage,
} from "./refund-decisions.server";

const NOW = new Date("2026-03-10T12:00:00.000Z");

function setup() {
  const db = createTestDb();
  const base = seedBaseData(db);
  const sent: EmailMessage[] = [];
  const decisions = createRefundDecisions({
    db,
    sendEmail: (message) => {
      sent.push(message);
    },
    now: () => NOW,
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

  return { db, base, sent, decisions, admin, otherInstructor, requestRefund, readRefund };
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
