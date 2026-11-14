import { asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { Database } from "~/db";
import {
  courses,
  purchases,
  refundPayments,
  RefundPaymentStatus,
  refunds,
  RefundStatus,
  users,
} from "~/db/schema";
import { getDecider, scopeToDecider } from "~/lib/refund-access.server";
import { getCourseUsage, type CourseUsage } from "~/lib/refunds.server";

// What the refunds screen shows. Read-only: changing a Refund is the
// Refund-decisions module's job.

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

export type ApprovedOrPaidRefundRow = {
  refundId: number;
  status: RefundStatus;
  learnerName: string;
  courseTitle: string;
  courseSlug: string;
  amountRefunded: number | null;
  paidAt: string | null;
  /** The latest Refund Payment, if one has been created. */
  payment: {
    status: RefundPaymentStatus;
    provider: string;
    providerReference: string | null;
    failureMessage: string | null;
  } | null;
  /** True when the latest Refund Payment failed, so a retry is allowed. */
  canRetry: boolean;
};

export function createRefundReadModels(db: Database) {
  /**
   * Every Refund with its Purchase, course, learner and (once decided) the
   * decider who resolved it; callers scope it.
   */
  function selectRefunds() {
    const resolver = alias(users, "resolver");
    return db
      .select({
        refundId: refunds.id,
        purchaseId: purchases.id,
        status: refunds.status,
        purchaseUserId: purchases.userId,
        courseId: courses.id,
        courseTitle: courses.title,
        courseSlug: courses.slug,
        courseOwnerId: courses.instructorId,
        amountPaid: purchases.amountPaid,
        amountRefunded: refunds.amountRefunded,
        paidAt: refunds.paidAt,
        learnerName: users.name,
        learnerEmail: users.email,
        resolverName: resolver.name,
        resolverEmail: resolver.email,
        requestedAt: refunds.requestedAt,
        reason: refunds.reason,
        lastDayInWindowAtRequest: refunds.lastDayInWindowAtRequest,
        secondsWatchedAtRequest: refunds.secondsWatchedAtRequest,
        completionAtRequest: refunds.completionAtRequest,
      })
      .from(refunds)
      .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
      .innerJoin(courses, eq(purchases.courseId, courses.id))
      .innerJoin(users, eq(purchases.userId, users.id))
      .leftJoin(resolver, eq(refunds.resolvedByUserId, resolver.id));
  }

  function latestRefundPayment(refundId: number) {
    return db
      .select({
        status: refundPayments.status,
        provider: refundPayments.provider,
        providerReference: refundPayments.providerReference,
        failureMessage: refundPayments.failureMessage,
      })
      .from(refundPayments)
      .where(eq(refundPayments.refundId, refundId))
      .orderBy(desc(refundPayments.id))
      .limit(1)
      .get();
  }

  function listRequested(deciderId: number): RequestedRefundRow[] {
    const decider = getDecider(db, deciderId);

    return selectRefunds()
      .where(scopeToDecider(decider, eq(refunds.status, RefundStatus.Requested)))
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

  function listApprovedAndPaid(deciderId: number): ApprovedOrPaidRefundRow[] {
    const decider = getDecider(db, deciderId);
    const approvedOrPaid = inArray(refunds.status, [
      RefundStatus.Approved,
      RefundStatus.Paid,
    ]);

    return selectRefunds()
      .where(scopeToDecider(decider, approvedOrPaid))
      .orderBy(desc(refunds.resolvedAt), desc(refunds.id))
      .all()
      .map((row) => {
        const payment = latestRefundPayment(row.refundId) ?? null;
        return {
          refundId: row.refundId,
          status: row.status,
          learnerName: row.learnerName,
          courseTitle: row.courseTitle,
          courseSlug: row.courseSlug,
          amountRefunded: row.amountRefunded,
          paidAt: row.paidAt,
          payment,
          canRetry:
            row.status === RefundStatus.Approved &&
            payment?.status === RefundPaymentStatus.Failed,
        };
      });
  }

  return {
    selectRefunds,
    latestRefundPayment,
    listRequested,
    listApprovedAndPaid,
  };
}
