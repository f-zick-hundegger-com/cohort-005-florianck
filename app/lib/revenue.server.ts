import { sql } from "drizzle-orm";
import { purchases, refunds, RefundStatus } from "~/db/schema";

/**
 * What a Purchase is worth to the instructor: the amount paid minus any
 * Approved or Paid Refund on it. Use inside sum() wherever revenue is added up.
 * A Refund is subtracted from the Purchase it belongs to, so it lands in the
 * same date bucket and course as the sale.
 */
export const netAmountPaid = sql<number>`(${purchases.amountPaid} - coalesce((select sum(${refunds.amountRefunded}) from ${refunds} where ${refunds.purchaseId} = ${purchases.id} and ${refunds.status} in (${RefundStatus.Approved}, ${RefundStatus.Paid})), 0))`;
