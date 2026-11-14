import { and, eq } from "drizzle-orm";
import type { Database } from "~/db";
import { coupons, enrollments, purchases } from "~/db/schema";

export type RedeemResult =
  | { ok: true; enrollment: typeof enrollments.$inferSelect }
  | { ok: false; error: string };

export function redeemCoupon(
  db: Database,
  code: string,
  userId: number,
  userCountry: string
): RedeemResult {
  const coupon = db.select().from(coupons).where(eq(coupons.code, code)).get();
  if (!coupon) {
    return { ok: false, error: "Coupon not found" };
  }

  if (coupon.redeemedByUserId !== null) {
    return { ok: false, error: "Coupon has already been redeemed" };
  }

  // The Purchase was refunded, so the seat is no longer paid for.
  if (coupon.voidedAt !== null) {
    return { ok: false, error: "This coupon is no longer valid" };
  }

  const existingEnrollment = db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.courseId, coupon.courseId)
      )
    )
    .get();

  if (existingEnrollment) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, coupon.purchaseId))
    .get();

  if (purchase?.country && purchase.country !== userCountry) {
    return {
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    };
  }

  db.update(coupons)
    .set({
      redeemedByUserId: userId,
      redeemedAt: new Date().toISOString(),
    })
    .where(eq(coupons.id, coupon.id))
    .run();

  const enrollment = db
    .insert(enrollments)
    .values({ userId, courseId: coupon.courseId })
    .returning()
    .get();

  return { ok: true, enrollment };
}
