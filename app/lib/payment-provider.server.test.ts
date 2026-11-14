import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createStripeMockProvider,
  getPaymentProvider,
  type ProviderConfirmation,
} from "./payment-provider.server";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the Stripe-like mock Payment Provider", () => {
  it("hands back a reference straight away, then logs and reports success after about 3 seconds", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const confirmations: ProviderConfirmation[] = [];
    const provider = createStripeMockProvider((confirmation) => {
      confirmations.push(confirmation);
    });

    const { reference } = await provider.start({
      amount: 4900,
      idempotencyKey: "key-1",
      refundPaymentId: 7,
    });

    expect(provider.name).toBe("stripe-mock");
    expect(reference).toMatch(/^re_mock_/);
    expect(confirmations).toEqual([]);

    await vi.advanceTimersByTimeAsync(2900);
    expect(confirmations).toEqual([]);

    await vi.advanceTimersByTimeAsync(200);
    expect(confirmations).toEqual([
      { refundPaymentId: 7, outcome: "succeeded" },
    ]);
    expect(log).toHaveBeenCalledWith(
      `[stripe-mock] refund ${reference} 4900 → succeeded`
    );
  });

  it("gives the same reference for the same idempotency key", async () => {
    const provider = createStripeMockProvider(() => {});
    const input = { amount: 100, idempotencyKey: "same", refundPaymentId: 1 };

    const first = await provider.start(input);
    const second = await provider.start(input);

    expect(second.reference).toBe(first.reference);
  });
});

describe("choosing the active Payment Provider", () => {
  it("defaults to the Stripe-like mock", () => {
    expect(getPaymentProvider({}, () => {}).name).toBe("stripe-mock");
  });

  it("picks the provider named by PAYMENT_PROVIDER", () => {
    expect(
      getPaymentProvider({ PAYMENT_PROVIDER: "stripe-mock" }, () => {}).name
    ).toBe("stripe-mock");
  });

  it("refuses an unknown provider name", () => {
    expect(() =>
      getPaymentProvider({ PAYMENT_PROVIDER: "nope" }, () => {})
    ).toThrow(/nope/);
  });
});
