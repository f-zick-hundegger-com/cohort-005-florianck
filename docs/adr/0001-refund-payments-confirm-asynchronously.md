# Refund Payments confirm asynchronously through a provider callback

Approving a Refund does not pay it. It starts a Refund Payment with the active Payment Provider, which hands back a reference right away and confirms success or failure later through a callback, the shape of a Stripe webhook. Only a successful confirmation makes the Refund Paid. We chose this over a synchronous "call and wait" because real providers can take anywhere from seconds to days. The mock provider (the default, picked by an env var) confirms after a few seconds and always succeeds, so a real adapter can slot in without touching the refund flow.

## Consequences

- Approved and Paid are separate states, and the learner gets two emails: one at approval, one at payment.
- A failed confirmation leaves the Refund Approved and emails the decider who approved it. Any decider for that course can retry, but only after the latest Refund Payment has failed. Each Refund Payment sends an idempotency key, so a retry cannot pay twice.
- A sweep at startup restarts Refund Payments still pending after a restart. It never retries failed ones automatically.
