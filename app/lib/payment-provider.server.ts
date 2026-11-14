import { RefundPaymentStatus } from "~/db/schema";

// The Payment Provider contract (ADR 0001). Starting a Refund Payment returns
// the provider's reference at once; success or failure arrives later through a
// callback. A provider never changes Refund state: the callback goes to the
// Refund-decisions module, which does.

/** The name PAYMENT_PROVIDER selects the mock by, and what it records. */
export const STRIPE_MOCK_PROVIDER = "stripe-mock";

export type StartRefundPaymentInput = {
  amount: number;
  idempotencyKey: string;
  refundPaymentId: number;
};

/** What a provider reports back, the shape of a Stripe webhook. */
export type ProviderConfirmation =
  | { refundPaymentId: number; outcome: RefundPaymentStatus.Succeeded }
  | {
      refundPaymentId: number;
      outcome: RefundPaymentStatus.Failed;
      failureMessage: string;
    };

export type ConfirmationCallback = (
  confirmation: ProviderConfirmation
) => void | Promise<void>;

export type PaymentProvider = {
  name: string;
  start(input: StartRefundPaymentInput): Promise<{ reference: string }>;
};

const MOCK_CONFIRMATION_DELAY_MS = 3000;

/** In-process and fire-and-forget: confirms success after about 3 seconds. */
export function createStripeMockProvider(
  onConfirmation: ConfirmationCallback
): PaymentProvider {
  return {
    name: STRIPE_MOCK_PROVIDER,
    async start({ amount, idempotencyKey, refundPaymentId }) {
      // Same key, same reference, like a real provider's idempotency.
      const reference = `re_mock_${idempotencyKey}`;
      console.log(`[stripe-mock] refund ${reference} ${amount} requested`);
      setTimeout(() => {
        console.log(`[stripe-mock] refund ${reference} ${amount} → ${RefundPaymentStatus.Succeeded}`);
        Promise.resolve(
          onConfirmation({
            refundPaymentId,
            outcome: RefundPaymentStatus.Succeeded,
          })
        ).catch((error) => {
          console.error("[stripe-mock] confirmation callback failed", error);
        });
      }, MOCK_CONFIRMATION_DELAY_MS);
      return { reference };
    },
  };
}

/** The active provider is chosen by the PAYMENT_PROVIDER env var. */
export function getPaymentProvider(
  env: Record<string, string | undefined>,
  onConfirmation: ConfirmationCallback
): PaymentProvider {
  const name = env.PAYMENT_PROVIDER ?? STRIPE_MOCK_PROVIDER;
  if (name === STRIPE_MOCK_PROVIDER) {
    return createStripeMockProvider(onConfirmation);
  }
  throw new Error(`Unknown PAYMENT_PROVIDER "${name}".`);
}
