import { and, asc, eq } from "drizzle-orm";
import type { Database } from "~/db";
import { courses, purchases, refunds, RefundStatus, users, UserRole } from "~/db/schema";
import { formatPrice } from "~/lib/utils";
import { getCourseUsage, type CourseUsage } from "~/lib/refunds.server";

// The one module that changes a Refund's state and decides who may do it.
// Routes only translate its RefundDecisionError into an HTTP response.

export type EmailMessage = { to: string; subject: string; body: string };
export type EmailSender = (message: EmailMessage) => void | Promise<void>;

/** There is no mail transport yet, so an email is built and logged. */
export const logEmail: EmailSender = (message) => {
  console.log(
    `[email] to=${message.to} subject=${message.subject}\n${message.body}`
  );
};

export class RefundDecisionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409
  ) {
    super(message);
    this.name = "RefundDecisionError";
  }
}

export type RequestedRefundRow = {
  refundId: number;
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  courseSlug: string;
  amountPaid: number;
  requestedAt: string;
  reason: string;
  /** Refund Eligibility as judged when the learner asked. */
  lastDayInWindowAtRequest: string | null;
  secondsWatchedAtRequest: number | null;
  completionAtRequest: number | null;
  /** Usage today, for information only. */
  current: CourseUsage;
};

export function buildRefundDeclinedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
  declineReason: string;
}): EmailMessage {
  return {
    to: input.learnerEmail,
    subject: `Your refund request for ${input.courseTitle} was declined`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have declined your refund request of ${formatPrice(input.amount)} for ${input.courseTitle}.`,
      "",
      `Reason: ${input.declineReason}`,
      "",
      "If you are still inside the 14-day refund window you can ask again from the course page.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

type Dependencies = {
  db: Database;
  sendEmail: EmailSender;
  now: () => Date;
};

export function createRefundDecisions({ db, sendEmail, now }: Dependencies) {
  function getDecider(userId: number) {
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

  /** Every Refund with its Purchase, course and learner; callers scope it. */
  function selectRefunds() {
    const query = db
      .select({
        refundId: refunds.id,
        status: refunds.status,
        purchaseUserId: purchases.userId,
        courseId: courses.id,
        courseTitle: courses.title,
        courseSlug: courses.slug,
        courseOwnerId: courses.instructorId,
        amountPaid: purchases.amountPaid,
        learnerName: users.name,
        learnerEmail: users.email,
        requestedAt: refunds.requestedAt,
        reason: refunds.reason,
        lastDayInWindowAtRequest: refunds.lastDayInWindowAtRequest,
        secondsWatchedAtRequest: refunds.secondsWatchedAtRequest,
        completionAtRequest: refunds.completionAtRequest,
      })
      .from(refunds)
      .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
      .innerJoin(courses, eq(purchases.courseId, courses.id))
      .innerJoin(users, eq(purchases.userId, users.id));
    return query;
  }

  function listRequested(deciderId: number): RequestedRefundRow[] {
    const decider = getDecider(deciderId);
    const query = selectRefunds();

    return query
      .where(
        decider.role === UserRole.Instructor
          ? and(
              eq(refunds.status, RefundStatus.Requested),
              eq(courses.instructorId, decider.id)
            )
          : eq(refunds.status, RefundStatus.Requested)
      )
      .orderBy(asc(refunds.requestedAt), asc(refunds.id))
      .all()
      .map((row) => ({
        refundId: row.refundId,
        learnerName: row.learnerName,
        learnerEmail: row.learnerEmail,
        courseTitle: row.courseTitle,
        courseSlug: row.courseSlug,
        amountPaid: row.amountPaid,
        requestedAt: row.requestedAt,
        reason: row.reason,
        lastDayInWindowAtRequest: row.lastDayInWindowAtRequest,
        secondsWatchedAtRequest: row.secondsWatchedAtRequest,
        completionAtRequest: row.completionAtRequest,
        current: getCourseUsage(db, row.purchaseUserId, row.courseId),
      }));
  }

  /** Loads a Refund and checks the decider may act on it. */
  function loadDecidable(deciderId: number, refundId: number) {
    const decider = getDecider(deciderId);
    const query = selectRefunds();
    const refund = query.where(eq(refunds.id, refundId)).get();

    // An instructor learns nothing about other instructors' Refunds.
    if (!refund) {
      throw new RefundDecisionError("Refund not found.", 404);
    }
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
    if (refund.status !== RefundStatus.Requested) {
      throw new RefundDecisionError("This refund has already been decided.", 409);
    }
    return refund;
  }

  async function decline(deciderId: number, refundId: number, reason: string) {
    const refund = loadDecidable(deciderId, refundId);

    const declineReason = reason.trim();
    if (declineReason === "") {
      throw new RefundDecisionError("A reason is required to decline.", 400);
    }

    // The status guard in the WHERE keeps two simultaneous deciders apart.
    const result = db
      .update(refunds)
      .set({
        status: RefundStatus.Declined,
        declineReason,
        resolvedByUserId: deciderId,
        resolvedAt: now().toISOString(),
      })
      .where(
        and(
          eq(refunds.id, refundId),
          eq(refunds.status, RefundStatus.Requested)
        )
      )
      .run();
    if (result.changes === 0) {
      throw new RefundDecisionError("This refund has already been decided.", 409);
    }

    await sendEmail(
      buildRefundDeclinedEmail({
        learnerName: refund.learnerName,
        learnerEmail: refund.learnerEmail,
        courseTitle: refund.courseTitle,
        amount: refund.amountPaid,
        declineReason,
      })
    );
  }

  return { listRequested, decline };
}
