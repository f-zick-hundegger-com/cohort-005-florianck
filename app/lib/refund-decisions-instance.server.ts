import { db } from "~/db";
import { getPaymentProvider } from "~/lib/payment-provider.server";
import {
  createRefundDecisions,
  logEmail,
} from "~/lib/refund-decisions.server";

// The Refund-decisions module wired to the real database, the active Payment
// Provider and the email log. The provider's callback loops back into the
// module, which is the only thing that changes Refund state.

type RefundDecisions = ReturnType<typeof createRefundDecisions>;

let instance: RefundDecisions | undefined;

export function getRefundDecisions(): RefundDecisions {
  if (!instance) {
    const created = createRefundDecisions({
      db,
      sendEmail: logEmail,
      now: () => new Date(),
      paymentProvider: getPaymentProvider(process.env, (confirmation) =>
        created.handleConfirmation(confirmation)
      ),
    });
    instance = created;
  }
  return instance;
}

// Vite's dev server re-evaluates modules; this keeps the sweep to once.
const SWEEP_FLAG = Symbol.for("cadence.refundPaymentSweepStarted");

/** Called from the server entry: restarts Refund Payments still pending. */
export function startRefundPaymentSweepOnce() {
  const flags = globalThis as Record<symbol, boolean | undefined>;
  if (flags[SWEEP_FLAG]) return;
  flags[SWEEP_FLAG] = true;
  getRefundDecisions()
    .sweepPendingRefundPayments()
    .catch((error) => {
      console.error("Refund Payment startup sweep failed", error);
    });
}
