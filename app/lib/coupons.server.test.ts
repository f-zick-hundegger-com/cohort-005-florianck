import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import { redeemCoupon } from "./coupons.server";

function setup(voidedAt: string | null) {
  const db = createTestDb();
  const base = seedBaseData(db);
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: base.instructor.id,
      courseId: base.course.id,
      amountPaid: 9800,
      country: "US",
    })
    .returning()
    .get();
  db.insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: base.course.id,
      code: "SEAT-1",
      purchaseId: purchase.id,
      voidedAt,
    })
    .run();
  return { db, base };
}

describe("redeeming a coupon code", () => {
  it("enrolls the learner with a valid code", () => {
    const { db, base } = setup(null);

    const result = redeemCoupon(db, "SEAT-1", base.user.id, "US");

    expect(result.ok).toBe(true);
    expect(
      db
        .select()
        .from(schema.enrollments)
        .where(eq(schema.enrollments.userId, base.user.id))
        .all()
    ).toHaveLength(1);
  });

  it("refuses a void code and does not enroll", () => {
    const { db, base } = setup("2026-03-10T12:00:00.000Z");

    const result = redeemCoupon(db, "SEAT-1", base.user.id, "US");

    expect(result).toMatchObject({ ok: false });
    expect(db.select().from(schema.enrollments).all()).toEqual([]);
  });
});
