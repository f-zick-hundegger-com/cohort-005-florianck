import { and, eq, type SQL } from "drizzle-orm";
import type { Database } from "~/db";
import { courses, users, UserRole } from "~/db/schema";

// Who may see and decide on a Refund. Routes only translate a
// RefundDecisionError into an HTTP response.

export class RefundDecisionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409
  ) {
    super(message);
    this.name = "RefundDecisionError";
  }
}

export function getDecider(db: Database, userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (
    !user ||
    (user.role !== UserRole.Admin && user.role !== UserRole.Instructor)
  ) {
    throw new RefundDecisionError(
      "Only admins and instructors can decide on refunds.",
      403
    );
  }
  return user;
}

type Decider = ReturnType<typeof getDecider>;

/** An admin sees every course; an instructor only the ones they own. */
export function scopeToDecider(decider: Decider, condition: SQL): SQL {
  if (decider.role !== UserRole.Instructor) return condition;
  return and(condition, eq(courses.instructorId, decider.id)) ?? condition;
}

/**
 * Throws unless the decider may act on the Refund: an instructor only on
 * their own courses, an admin never on their own Purchase.
 */
export function assertMayDecide(
  decider: Decider,
  refund: { courseOwnerId: number; purchaseUserId: number }
) {
  if (
    decider.role === UserRole.Instructor &&
    refund.courseOwnerId !== decider.id
  ) {
    throw new RefundDecisionError(
      "You can only decide on refunds for courses you own.",
      403
    );
  }
  if (decider.role === UserRole.Admin && refund.purchaseUserId === decider.id) {
    throw new RefundDecisionError(
      "You cannot decide on a refund for your own purchase.",
      403
    );
  }
}
