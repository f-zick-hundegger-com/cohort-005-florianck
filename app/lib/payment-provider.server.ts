// The Payment Provider contract (ADR 0001). Starting a Refund Payment returns
// the provider's reference at once; success or failure arrives later through a
// callback. A provider never changes Refund state: the callback goes to the
// Refund-decisions module, which does.

export type StartRefundPaymentInput = {
  amount: number;
  idempotencyKey: string;
  refundPaymentId: number;
};

/** What a provider reports back, the shape of a Stripe webhook. */
export type ProviderConfirmation = {
  refundPaymentId: number;
  outcome: "succeeded";
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
    name: "stripe-mock",
    async start({ amount, idempotencyKey, refundPaymentId }) {
      // Same key, same reference, like a real provider's idempotency.
      const reference = `re_mock_${idempotencyKey}`;
      setTimeout(() => {
        console.log(`[stripe-mock] refund ${reference} ${amount} → succeeded`);
        Promise.resolve(
          onConfirmation({ refundPaymentId, outcome: "succeeded" })
        ).catch((error) => {
          console.error("[stripe-mock] confirmation callback failed", error);
        });
      }, MOCK_CONFIRMATION_DELAY_MS);
      return { reference };
    },
  };
}

const DEFAULT_PROVIDER = "stripe-mock";

/** The active provider is chosen by the PAYMENT_PROVIDER env var. */
export function getPaymentProvider(
  env: Record<string, string | undefined>,
  onConfirmation: ConfirmationCallback
): PaymentProvider {
  const name = env.PAYMENT_PROVIDER ?? DEFAULT_PROVIDER;
  if (name === "stripe-mock") {
    return createStripeMockProvider(onConfirmation);
  }
  throw new Error(`Unknown PAYMENT_PROVIDER "${name}".`);
}
