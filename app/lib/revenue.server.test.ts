import { describe, expect, it } from "vitest";
import { sum } from "drizzle-orm";
import * as schema from "~/db/schema";
import { RefundStatus } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import { netAmountPaid } from "./revenue.server";

function setup() {
  const db = createTestDb();
  const base = seedBaseData(db);

  function purchaseWithRefund(status: RefundStatus | null, amountPaid = 5000) {
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid,
        country: "US",
      })
      .returning()
      .get();
    if (status !== null) {
      db.insert(schema.refunds)
        .values({
          purchaseId: purchase.id,
          reason: "Not what I expected.",
          status,
          amountRefunded: status === RefundStatus.Requested ? null : amountPaid,
        })
        .run();
    }
  }

  function revenue() {
    const row = db
      .select({ net: sum(netAmountPaid) })
      .from(schema.purchases)
      .get();
    return Number(row?.net ?? 0);
  }

  return { purchaseWithRefund, revenue };
}

describe("revenue net of Refunds", () => {
  it("counts a Purchase with no Refund in full", () => {
    const { purchaseWithRefund, revenue } = setup();
    purchaseWithRefund(null);
    expect(revenue()).toBe(5000);
  });

  it("subtracts an Approved Refund", () => {
    const { purchaseWithRefund, revenue } = setup();
    purchaseWithRefund(null, 3000);
    purchaseWithRefund(RefundStatus.Approved);
    expect(revenue()).toBe(3000);
  });

  it("subtracts a Paid Refund", () => {
    const { purchaseWithRefund, revenue } = setup();
    purchaseWithRefund(null, 3000);
    purchaseWithRefund(RefundStatus.Paid);
    expect(revenue()).toBe(3000);
  });

  it("does not subtract Requested or Declined Refunds", () => {
    const { purchaseWithRefund, revenue } = setup();
    purchaseWithRefund(RefundStatus.Requested);
    purchaseWithRefund(RefundStatus.Declined);
    expect(revenue()).toBe(10000);
  });
});
