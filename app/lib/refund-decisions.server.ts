import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "~/db";
import {
  coupons,
  courses,
  enrollments,
  purchases,
  refundPayments,
  RefundPaymentStatus,
  refunds,
  RefundStatus,
  users,
  UserRole,
} from "~/db/schema";
import { formatPrice } from "~/lib/utils";
import type {
  PaymentProvider,
  ProviderConfirmation,
} from "~/lib/payment-provider.server";
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

export function buildRefundApprovedEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
}): EmailMessage {
  return {
    to: input.learnerEmail,
    subject: `Your refund for ${input.courseTitle} was approved`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have approved your refund of ${formatPrice(input.amount)} for ${input.courseTitle}.`,
      "",
      "You no longer have access to the course, but your progress is kept in case you buy it again.",
      "",
      "We will email you again when the money has been sent.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export function buildRefundPaidEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
}): EmailMessage {
  return {
    to: input.learnerEmail,
    subject: `Your refund for ${input.courseTitle} was paid`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have sent your refund of ${formatPrice(input.amount)} for ${input.courseTitle} back to you.`,
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

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
  } | null;
};

type Dependencies = {
  db: Database;
  sendEmail: EmailSender;
  now: () => Date;
  /** The active Payment Provider. It never changes Refund state itself. */
  paymentProvider: PaymentProvider;
};

export function createRefundDecisions({
  db,
  sendEmail,
  now,
  paymentProvider,
}: Dependencies) {
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

  /**
   * Approving always refunds the full amount paid. Eligibility was judged when
   * the learner asked, so it is not re-run here.
   */
  async function approve(deciderId: number, refundId: number) {
    const refund = loadDecidable(deciderId, refundId);
    const decidedAt = now().toISOString();

    const refundPaymentId = db.transaction((tx) => {
      // The status guard in the WHERE keeps two simultaneous deciders apart.
      const result = tx
        .update(refunds)
        .set({
          status: RefundStatus.Approved,
          amountRefunded: refund.amountPaid,
          resolvedByUserId: deciderId,
          resolvedAt: decidedAt,
        })
        .where(
          and(
            eq(refunds.id, refundId),
            eq(refunds.status, RefundStatus.Requested)
          )
        )
        .run();
      if (result.changes === 0) {
        throw new RefundDecisionError(
          "This refund has already been decided.",
          409
        );
      }

      // Access goes; lesson progress and watch events stay (ADR 0002).
      tx.delete(enrollments)
        .where(
          and(
            eq(enrollments.userId, refund.purchaseUserId),
            eq(enrollments.courseId, refund.courseId)
          )
        )
        .run();

      // Claimed seats are left alone; only unclaimed codes stop working.
      tx.update(coupons)
        .set({ voidedAt: decidedAt })
        .where(
          and(
            eq(coupons.purchaseId, refund.purchaseId),
            isNull(coupons.redeemedAt),
            isNull(coupons.voidedAt)
          )
        )
        .run();

      return tx
        .insert(refundPayments)
        .values({
          refundId,
          provider: paymentProvider.name,
          idempotencyKey: randomUUID(),
          createdAt: decidedAt,
        })
        .returning({ id: refundPayments.id })
        .get().id;
    });

    // Approval does not wait for the provider: its answer arrives later
    // through handleConfirmation (ADR 0001).
    startInBackground(refundPaymentId);

    await sendEmail(
      buildRefundApprovedEmail({
        learnerName: refund.learnerName,
        learnerEmail: refund.learnerEmail,
        courseTitle: refund.courseTitle,
        amount: refund.amountPaid,
      })
    );
  }

  /** Asks the provider to send the money; resolves once it has a reference. */
  async function startRefundPayment(refundPaymentId: number) {
    const payment = db
      .select({
        idempotencyKey: refundPayments.idempotencyKey,
        amount: refunds.amountRefunded,
      })
      .from(refundPayments)
      .innerJoin(refunds, eq(refundPayments.refundId, refunds.id))
      .where(eq(refundPayments.id, refundPaymentId))
      .get();
    if (!payment || payment.amount === null) return;

    const { reference } = await paymentProvider.start({
      amount: payment.amount,
      idempotencyKey: payment.idempotencyKey,
      refundPaymentId,
    });
    db.update(refundPayments)
      .set({ providerReference: reference })
      .where(eq(refundPayments.id, refundPaymentId))
      .run();
  }

  function startInBackground(refundPaymentId: number) {
    startRefundPayment(refundPaymentId).catch((error) => {
      // Still pending: the startup sweep will start it again.
      console.error(`Could not start Refund Payment ${refundPaymentId}`, error);
    });
  }

  /**
   * The provider's callback. The only way a Refund becomes Paid. Safe to
   * handle twice: only a still-pending Refund Payment is acted on.
   */
  async function handleConfirmation(confirmation: ProviderConfirmation) {
    const confirmedAt = now().toISOString();

    const paid = db.transaction((tx) => {
      const result = tx
        .update(refundPayments)
        .set({
          status: RefundPaymentStatus.Succeeded,
          confirmedAt,
        })
        .where(
          and(
            eq(refundPayments.id, confirmation.refundPaymentId),
            eq(refundPayments.status, RefundPaymentStatus.Pending)
          )
        )
        .run();
      if (result.changes === 0) return null;

      const payment = tx
        .select({ refundId: refundPayments.refundId })
        .from(refundPayments)
        .where(eq(refundPayments.id, confirmation.refundPaymentId))
        .get();
      if (!payment) return null;

      tx.update(refunds)
        .set({ status: RefundStatus.Paid, paidAt: confirmedAt })
        .where(eq(refunds.id, payment.refundId))
        .run();
      return payment.refundId;
    });
    if (paid === null) return;

    const refund = selectRefunds().where(eq(refunds.id, paid)).get();
    if (!refund) return;
    await sendEmail(
      buildRefundPaidEmail({
        learnerName: refund.learnerName,
        learnerEmail: refund.learnerEmail,
        courseTitle: refund.courseTitle,
        amount: refund.amountRefunded ?? refund.amountPaid,
      })
    );
  }

  /** Run at server start: restarts Refund Payments still pending. */
  async function sweepPendingRefundPayments() {
    const pending = db
      .select({ id: refundPayments.id })
      .from(refundPayments)
      .where(eq(refundPayments.status, RefundPaymentStatus.Pending))
      .all();
    for (const { id } of pending) {
      startInBackground(id);
    }
  }

  function listApprovedAndPaid(deciderId: number): ApprovedOrPaidRefundRow[] {
    const decider = getDecider(deciderId);
    const inScope = inArray(refunds.status, [
      RefundStatus.Approved,
      RefundStatus.Paid,
    ]);

    return selectRefunds()
      .where(
        decider.role === UserRole.Instructor
          ? and(inScope, eq(courses.instructorId, decider.id))
          : inScope
      )
      .orderBy(desc(refunds.resolvedAt), desc(refunds.id))
      .all()
      .map((row) => ({
        refundId: row.refundId,
        status: row.status,
        learnerName: row.learnerName,
        courseTitle: row.courseTitle,
        courseSlug: row.courseSlug,
        amountRefunded: row.amountRefunded,
        paidAt: row.paidAt,
        payment:
          db
            .select({
              status: refundPayments.status,
              provider: refundPayments.provider,
              providerReference: refundPayments.providerReference,
            })
            .from(refundPayments)
            .where(eq(refundPayments.refundId, row.refundId))
            .orderBy(desc(refundPayments.id))
            .limit(1)
            .get() ?? null,
      }));
  }

  return {
    listRequested,
    listApprovedAndPaid,
    approve,
    decline,
    handleConfirmation,
    sweepPendingRefundPayments,
  };
}
