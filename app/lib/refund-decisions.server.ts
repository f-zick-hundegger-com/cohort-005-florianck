import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "~/db";
import {
  coupons,
  enrollments,
  refundPayments,
  RefundPaymentStatus,
  refunds,
  RefundStatus,
} from "~/db/schema";
import type {
  PaymentProvider,
  ProviderConfirmation,
} from "~/lib/payment-provider.server";
import {
  assertMayDecide,
  getDecider,
  RefundDecisionError,
} from "~/lib/refund-access.server";
import {
  buildRefundApprovedEmail,
  buildRefundDeclinedEmail,
  buildRefundPaidEmail,
  buildRefundPaymentFailedEmail,
  type EmailSender,
} from "~/lib/refund-emails.server";
import { createRefundReadModels } from "~/lib/refund-read-models.server";

// The one module that changes a Refund's state. Who may decide lives in
// refund-access, what the screen reads in refund-read-models, the emails in
// refund-emails; this module owns every transition and the Refund Payment.

export { RefundDecisionError };
export {
  buildRefundApprovedEmail,
  buildRefundDeclinedEmail,
  buildRefundPaidEmail,
  buildRefundPaymentFailedEmail,
  logEmail,
  type EmailMessage,
  type EmailSender,
} from "~/lib/refund-emails.server";
export type {
  ApprovedOrPaidRefundRow,
  RequestedRefundRow,
} from "~/lib/refund-read-models.server";

type Dependencies = {
  db: Database;
  sendEmail: EmailSender;
  now: () => Date;
  /** The active Payment Provider. It never changes Refund state itself. */
  paymentProvider: PaymentProvider;
};

/** A database or an open transaction. */
type Writer = Pick<Database, "insert" | "update">;

const ALREADY_DECIDED = "This refund has already been decided.";

export function createRefundDecisions({
  db,
  sendEmail,
  now,
  paymentProvider,
}: Dependencies) {
  const { selectRefunds, latestRefundPayment, listRequested, listApprovedAndPaid } =
    createRefundReadModels(db);

  /** Loads a Refund and checks the decider may act on it. */
  function loadDecidable(deciderId: number, refundId: number) {
    const decider = getDecider(db, deciderId);
    const refund = selectRefunds().where(eq(refunds.id, refundId)).get();

    // An instructor learns nothing about other instructors' Refunds.
    if (!refund) {
      throw new RefundDecisionError("Refund not found.", 404);
    }
    assertMayDecide(decider, refund);
    return refund;
  }

  /** Like loadDecidable, but the Refund must still be Requested. */
  function loadRequested(deciderId: number, refundId: number) {
    const refund = loadDecidable(deciderId, refundId);
    if (refund.status !== RefundStatus.Requested) {
      throw new RefundDecisionError(ALREADY_DECIDED, 409);
    }
    return refund;
  }

  /**
   * Moves a Requested Refund to its decided state. The status guard in the
   * WHERE keeps two simultaneous deciders apart.
   */
  function recordDecision(
    writer: Writer,
    refundId: number,
    deciderId: number,
    decidedAt: string,
    changes: Partial<typeof refunds.$inferInsert>
  ) {
    const result = writer
      .update(refunds)
      .set({ ...changes, resolvedByUserId: deciderId, resolvedAt: decidedAt })
      .where(
        and(
          eq(refunds.id, refundId),
          eq(refunds.status, RefundStatus.Requested)
        )
      )
      .run();
    if (result.changes === 0) {
      throw new RefundDecisionError(ALREADY_DECIDED, 409);
    }
  }

  /** A new pending Refund Payment with its own idempotency key. */
  function createRefundPayment(
    writer: Writer,
    refundId: number,
    createdAt: string
  ) {
    return writer
      .insert(refundPayments)
      .values({
        refundId,
        provider: paymentProvider.name,
        idempotencyKey: randomUUID(),
        createdAt,
      })
      .returning({ id: refundPayments.id })
      .get().id;
  }

  async function decline(deciderId: number, refundId: number, reason: string) {
    const refund = loadRequested(deciderId, refundId);

    const declineReason = reason.trim();
    if (declineReason === "") {
      throw new RefundDecisionError("A reason is required to decline.", 400);
    }

    recordDecision(db, refundId, deciderId, now().toISOString(), {
      status: RefundStatus.Declined,
      declineReason,
    });

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
    const refund = loadRequested(deciderId, refundId);
    const decidedAt = now().toISOString();

    const refundPaymentId = db.transaction((tx) => {
      recordDecision(tx, refundId, deciderId, decidedAt, {
        status: RefundStatus.Approved,
        amountRefunded: refund.amountPaid,
      });

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

      return createRefundPayment(tx, refundId, decidedAt);
    });

    // The learner hears "approved" before the payment starts, so a provider
    // that confirms at once cannot get its "paid" email in first. Approval
    // does not wait for the provider: its answer arrives later through
    // handleConfirmation (ADR 0001).
    try {
      await sendEmail(
        buildRefundApprovedEmail({
          learnerName: refund.learnerName,
          learnerEmail: refund.learnerEmail,
          courseTitle: refund.courseTitle,
          amount: refund.amountPaid,
        })
      );
    } finally {
      startInBackground(refundPaymentId);
    }
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
   * Records the provider's answer on a still-pending Refund Payment, and makes
   * the Refund Paid on success. Returns the Refund's id, or null when the
   * Refund Payment was already settled (a duplicate confirmation).
   */
  function recordConfirmation(confirmation: ProviderConfirmation) {
    const confirmedAt = now().toISOString();
    const settlement =
      confirmation.outcome === RefundPaymentStatus.Succeeded
        ? { status: RefundPaymentStatus.Succeeded as const, confirmedAt }
        : {
            status: RefundPaymentStatus.Failed as const,
            confirmedAt,
            failureMessage: confirmation.failureMessage,
          };

    return db.transaction((tx) => {
      const settled = tx
        .update(refundPayments)
        .set(settlement)
        .where(
          and(
            eq(refundPayments.id, confirmation.refundPaymentId),
            eq(refundPayments.status, RefundPaymentStatus.Pending)
          )
        )
        .returning({ refundId: refundPayments.refundId })
        .get();
      if (!settled) return null;

      // A failure leaves the Refund Approved.
      if (settlement.status === RefundPaymentStatus.Succeeded) {
        tx.update(refunds)
          .set({ status: RefundStatus.Paid, paidAt: confirmedAt })
          .where(eq(refunds.id, settled.refundId))
          .run();
      }
      return settled.refundId;
    });
  }

  /**
   * The provider's callback. The only way a Refund becomes Paid. Safe to
   * handle twice: only a still-pending Refund Payment is acted on.
   */
  async function handleConfirmation(confirmation: ProviderConfirmation) {
    const refundId = recordConfirmation(confirmation);
    if (refundId === null) return;

    const refund = selectRefunds().where(eq(refunds.id, refundId)).get();
    if (!refund) return;
    const amount = refund.amountRefunded ?? refund.amountPaid;

    if (confirmation.outcome === RefundPaymentStatus.Succeeded) {
      await sendEmail(
        buildRefundPaidEmail({
          learnerName: refund.learnerName,
          learnerEmail: refund.learnerEmail,
          courseTitle: refund.courseTitle,
          amount,
        })
      );
      return;
    }

    // Only the decider who approved it hears about a failure, not the learner.
    if (!refund.resolverName || !refund.resolverEmail) return;
    await sendEmail(
      buildRefundPaymentFailedEmail({
        deciderName: refund.resolverName,
        deciderEmail: refund.resolverEmail,
        learnerName: refund.learnerName,
        courseTitle: refund.courseTitle,
        amount,
        failureMessage: confirmation.failureMessage,
      })
    );
  }

  /**
   * Any decider for the course may retry, but only once the latest Refund
   * Payment has failed, so two payments are never in flight together.
   */
  async function retryRefundPayment(deciderId: number, refundId: number) {
    const refund = loadDecidable(deciderId, refundId);

    if (
      refund.status !== RefundStatus.Approved ||
      latestRefundPayment(refundId)?.status !== RefundPaymentStatus.Failed
    ) {
      throw new RefundDecisionError(
        "A payment can only be retried after the latest one has failed.",
        409
      );
    }

    startInBackground(
      createRefundPayment(db, refundId, now().toISOString())
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

  return {
    listRequested,
    listApprovedAndPaid,
    approve,
    decline,
    handleConfirmation,
    retryRefundPayment,
    sweepPendingRefundPayments,
  };
}
