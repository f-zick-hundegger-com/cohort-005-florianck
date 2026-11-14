import { and, eq } from "drizzle-orm";
import { data } from "react-router";
import type { Database } from "~/db";
import { coupons, enrollments, purchases } from "~/db/schema";

export function redeemCoupon(
  db: Database,
  code: string,
  userId: number,
  userCountry: string
): typeof enrollments.$inferSelect {
  const coupon = db.select().from(coupons).where(eq(coupons.code, code)).get();
  if (!coupon) {
    throw data("Coupon not found", { status: 400 });
  }

  if (coupon.redeemedByUserId !== null) {
    throw data("Coupon has already been redeemed", { status: 400 });
  }

  // The Purchase was refunded, so the seat is no longer paid for.
  if (coupon.voidedAt !== null) {
    throw data("This coupon is no longer valid", { status: 400 });
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
    throw data("You are already enrolled in this course", { status: 400 });
  }

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, coupon.purchaseId))
    .get();

  if (purchase?.country && purchase.country !== userCountry) {
    throw data("This coupon can only be redeemed from the same country as the purchaser", { status: 400 });
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

  return enrollment;
}
