import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { RefundPaymentStatus, RefundStatus, UserRole } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  createRefundDecisions,
  type EmailMessage,
} from "./refund-decisions.server";
import type {
  PaymentProvider,
  StartRefundPaymentInput,
} from "./payment-provider.server";

// The Refund-decisions module against a fake Payment Provider whose
// confirmations the test fires by hand.

const NOW = new Date("2026-03-10T12:00:00.000Z");

function setup() {
  const db = createTestDb();
  const base = seedBaseData(db);
  const sent: EmailMessage[] = [];
  const started: StartRefundPaymentInput[] = [];
  const paymentProvider: PaymentProvider = {
    name: "fake-pay",
    async start(input) {
      started.push(input);
      return { reference: `fake_ref_${input.refundPaymentId}` };
    },
  };
  const decisions = createRefundDecisions({
    db,
    sendEmail: (message) => {
      sent.push(message);
    },
    now: () => NOW,
    paymentProvider,
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

  function requestRefund() {
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 4900,
        country: "US",
      })
      .returning()
      .get();
    return db
      .insert(schema.refunds)
      .values({ purchaseId: purchase.id, reason: "It was not what I expected." })
      .returning()
      .get();
  }

  const payments = () => db.select().from(schema.refundPayments).all();
  const readRefund = (id: number) =>
    db.select().from(schema.refunds).where(eq(schema.refunds.id, id)).get();

  return {
    db,
    base,
    sent,
    started,
    decisions,
    admin,
    otherInstructor,
    requestRefund,
    payments,
    readRefund,
  };
}

async function approved() {
  const ctx = setup();
  const refund = ctx.requestRefund();
  await ctx.decisions.approve(ctx.admin.id, refund.id);
  return { ...ctx, refund };
}

describe("confirming a Refund Payment", () => {
  it("records the provider's reference once it has been handed back", async () => {
    const { payments } = await approved();
    await Promise.resolve();

    expect(payments()[0].providerReference).toBe(`fake_ref_${payments()[0].id}`);
  });

  it("makes the Refund Paid on success and emails the learner: approved, then paid", async () => {
    const { decisions, payments, refund, readRefund, sent } = await approved();

    await decisions.handleConfirmation({
      refundPaymentId: payments()[0].id,
      outcome: "succeeded",
    });

    expect(readRefund(refund.id)).toMatchObject({
      status: RefundStatus.Paid,
      paidAt: NOW.toISOString(),
    });
    expect(payments()[0]).toMatchObject({
      status: RefundPaymentStatus.Succeeded,
      confirmedAt: NOW.toISOString(),
    });
    expect(sent.map((email) => email.subject)).toEqual([
      expect.stringContaining("approved"),
      expect.stringContaining("paid"),
    ]);
    expect(sent[1].to).toBe("test@example.com");
  });

  it("changes nothing and sends no extra email on a duplicate confirmation", async () => {
    const { decisions, payments, refund, readRefund, sent } = await approved();
    const confirmation = {
      refundPaymentId: payments()[0].id,
      outcome: "succeeded",
    } as const;

    await decisions.handleConfirmation(confirmation);
    const afterFirst = readRefund(refund.id);
    await decisions.handleConfirmation(confirmation);

    expect(readRefund(refund.id)).toEqual(afterFirst);
    expect(sent).toHaveLength(2);
  });

  it("ignores a confirmation for a Refund Payment that does not exist", async () => {
    const { decisions, sent } = await approved();

    await decisions.handleConfirmation({
      refundPaymentId: 999,
      outcome: "succeeded",
    });

    expect(sent).toHaveLength(1);
  });
});

describe("listing Approved and Paid Refunds", () => {
  it("shows each with its latest Refund Payment, and keeps them out of the Requested list", async () => {
    const { decisions, admin, payments, refund } = await approved();
    await Promise.resolve();

    expect(decisions.listRequested(admin.id)).toEqual([]);
    expect(decisions.listApprovedAndPaid(admin.id)).toMatchObject([
      {
        refundId: refund.id,
        status: RefundStatus.Approved,
        paidAt: null,
        payment: {
          status: RefundPaymentStatus.Pending,
          provider: "fake-pay",
          providerReference: `fake_ref_${payments()[0].id}`,
        },
      },
    ]);

    await decisions.handleConfirmation({
      refundPaymentId: payments()[0].id,
      outcome: "succeeded",
    });

    expect(decisions.listApprovedAndPaid(admin.id)).toMatchObject([
      {
        status: RefundStatus.Paid,
        paidAt: NOW.toISOString(),
        payment: { status: RefundPaymentStatus.Succeeded },
      },
    ]);
  });

  it("shows an instructor only the Refunds of their own courses", async () => {
    const { decisions, otherInstructor, base } = await approved();

    expect(decisions.listApprovedAndPaid(otherInstructor.id)).toEqual([]);
    expect(decisions.listApprovedAndPaid(base.instructor.id)).toHaveLength(1);
  });
});

describe("the startup sweep", () => {
  it("starts pending Refund Payments again with the same key, and ignores failed ones", async () => {
    const { decisions, db, started, requestRefund, admin, payments } = setup();
    await decisions.approve(admin.id, requestRefund().id);
    await decisions.approve(admin.id, requestRefund().id);
    const [pending, failed] = payments();
    db.update(schema.refundPayments)
      .set({ status: RefundPaymentStatus.Failed })
      .where(eq(schema.refundPayments.id, failed.id))
      .run();
    started.length = 0;

    await decisions.sweepPendingRefundPayments();

    expect(started).toEqual([
      {
        amount: 4900,
        idempotencyKey: pending.idempotencyKey,
        refundPaymentId: pending.id,
      },
    ]);
  });
});
