import { describe, it, expect } from "vitest";
import {
  decideRefundEligibility,
  REFUND_WATCH_LIMIT_SECONDS,
  type RefundFacts,
} from "./refunds.server";
import { RefundStatus } from "~/db/schema";

const purchasedAt = new Date(2026, 0, 1, 23, 0);

function facts(overrides: Partial<RefundFacts> = {}): RefundFacts {
  return {
    purchase: { id: 7, amountPaid: 4900, createdAt: purchasedAt.toISOString() },
    refundStatuses: [],
    isClaimedTeamSeat: false,
    lessonCount: 10,
    completedLessonCount: 0,
    secondsWatched: 0,
    ...overrides,
  };
}

const dayAfterPurchase = new Date(2026, 0, 2, 12, 0);

describe("decideRefundEligibility", () => {
  it("is eligible for a fresh purchase, refunding what was paid", () => {
    expect(decideRefundEligibility(facts(), dayAfterPurchase)).toEqual({
      eligible: true,
      purchaseId: 7,
      refundableAmount: 4900,
      lastDayInWindow: "2026-01-15",
    });
  });

  it("refunds the amount paid, never more", () => {
    const result = decideRefundEligibility(
      facts({
        purchase: {
          id: 7,
          amountPaid: 1000,
          createdAt: purchasedAt.toISOString(),
        },
      }),
      dayAfterPurchase
    );
    expect(result).toMatchObject({ eligible: true, refundableAmount: 1000 });
  });

  it("is not eligible without a purchase", () => {
    expect(
      decideRefundEligibility(facts({ purchase: null }), dayAfterPurchase)
    ).toEqual({ eligible: false, reason: "no-purchase" });
  });

  it("is not eligible while a Requested Refund is waiting", () => {
    expect(
      decideRefundEligibility(
        facts({ refundStatuses: [RefundStatus.Requested] }),
        dayAfterPurchase
      )
    ).toEqual({ eligible: false, reason: "already-refunded" });
  });

  it("is not eligible once a Refund has been Approved", () => {
    expect(
      decideRefundEligibility(
        facts({ refundStatuses: [RefundStatus.Approved] }),
        dayAfterPurchase
      )
    ).toEqual({ eligible: false, reason: "already-refunded" });
  });

  it("lets the learner ask again after a Declined Refund", () => {
    expect(
      decideRefundEligibility(
        facts({ refundStatuses: [RefundStatus.Declined] }),
        dayAfterPurchase
      )
    ).toMatchObject({ eligible: true });
  });

  it("is not eligible when an earlier Refund was Declined and a later one Approved", () => {
    expect(
      decideRefundEligibility(
        facts({
          refundStatuses: [RefundStatus.Declined, RefundStatus.Approved],
        }),
        dayAfterPurchase
      )
    ).toEqual({ eligible: false, reason: "already-refunded" });
  });

  it("is not eligible for a claimed team seat", () => {
    expect(
      decideRefundEligibility(
        facts({ isClaimedTeamSeat: true }),
        dayAfterPurchase
      )
    ).toEqual({ eligible: false, reason: "claimed-team-seat" });
  });

  it("includes the whole of the last day in the refund window", () => {
    expect(
      decideRefundEligibility(facts(), new Date(2026, 0, 15, 23, 59))
    ).toMatchObject({ eligible: true });
  });

  it("is not eligible after the refund window", () => {
    expect(
      decideRefundEligibility(facts(), new Date(2026, 0, 16, 0, 1))
    ).toEqual({ eligible: false, reason: "outside-refund-window" });
  });

  it("is not eligible once half the lessons are completed", () => {
    expect(
      decideRefundEligibility(
        facts({ completedLessonCount: 5 }),
        dayAfterPurchase
      )
    ).toEqual({ eligible: false, reason: "completed-too-much" });
  });

  it("is eligible just under half the lessons completed", () => {
    expect(
      decideRefundEligibility(
        facts({ completedLessonCount: 4 }),
        dayAfterPurchase
      )
    ).toMatchObject({ eligible: true });
  });

  it("is not eligible once the watch limit is reached", () => {
    expect(
      decideRefundEligibility(
        facts({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS }),
        dayAfterPurchase
      )
    ).toEqual({ eligible: false, reason: "watched-too-much" });
  });

  it("ignores completion for a course with no lessons", () => {
    expect(
      decideRefundEligibility(
        facts({ lessonCount: 0, completedLessonCount: 0 }),
        dayAfterPurchase
      )
    ).toMatchObject({ eligible: true });
  });
});

describe("decideRefundEligibility with a Paid Refund", () => {
  it("is not eligible again on a Purchase whose Refund was Paid", () => {
    expect(
      decideRefundEligibility(
        facts({ refundStatuses: [RefundStatus.Paid] }),
        dayAfterPurchase
      )
    ).toMatchObject({ eligible: false, reason: "already-refunded" });
  });
});
