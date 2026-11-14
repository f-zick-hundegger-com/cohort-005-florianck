import { describe, expect, it } from "vitest";
import * as schema from "~/db/schema";
import { RefundStatus } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import { getRefundEligibility, REFUND_WATCH_LIMIT_SECONDS } from "./refunds.server";

// A learner whose first Purchase was refunded and who buys the course again.
function setup() {
  const db = createTestDb();
  const base = seedBaseData(db);
  const buy = (createdAt: string) =>
    db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 4900,
        country: "US",
        createdAt,
      })
      .returning()
      .get();

  const first = buy("2026-01-01T10:00:00.000Z");
  db.insert(schema.refunds)
    .values({
      purchaseId: first.id,
      reason: "Changed my mind.",
      status: RefundStatus.Paid,
      amountRefunded: 4900,
    })
    .run();
  const second = buy("2026-03-01T10:00:00.000Z");
  return { db, base, first, second };
}

describe("buying a course again after a Refund", () => {
  it("is eligible on the new Purchase inside its own window", () => {
    const { db, second } = setup();

    const result = getRefundEligibility(
      db,
      second.userId,
      second.courseId,
      new Date("2026-03-05T12:00:00.000Z")
    );

    expect(result).toMatchObject({ eligible: true, purchaseId: second.id });
  });

  it("counts watch time from before the Refund toward the limit", () => {
    const { db, base, second } = setup();
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
        positionSeconds: REFUND_WATCH_LIMIT_SECONDS + 60,
        createdAt: "2026-01-05T10:00:00.000Z",
      })
      .run();

    const result = getRefundEligibility(
      db,
      second.userId,
      second.courseId,
      new Date("2026-03-05T12:00:00.000Z")
    );

    expect(result).toMatchObject({ eligible: false });
  });
});
