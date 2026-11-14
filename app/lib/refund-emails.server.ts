import { formatPrice } from "~/lib/utils";
import { REFUND_WINDOW_DAYS } from "~/lib/refunds.server";

// The emails sent as a Refund moves along. There is no mail transport yet, so
// an email is built and logged.

export type EmailMessage = { to: string; subject: string; body: string };
export type EmailSender = (message: EmailMessage) => void | Promise<void>;

export const logEmail: EmailSender = (message) => {
  console.log(
    `[email] to=${message.to} subject=${message.subject}\n${message.body}`
  );
};

/** What every email to the learner says about the Refund. */
export type RefundEmailDetails = {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
};

export function buildRefundDeclinedEmail(
  input: RefundEmailDetails & { declineReason: string }
): EmailMessage {
  return {
    to: input.learnerEmail,
    subject: `Your refund request for ${input.courseTitle} was declined`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have declined your refund request of ${formatPrice(input.amount)} for ${input.courseTitle}.`,
      "",
      `Reason: ${input.declineReason}`,
      "",
      `If you are still inside the ${REFUND_WINDOW_DAYS}-day refund window you can ask again from the course page.`,
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export function buildRefundApprovedEmail(
  input: RefundEmailDetails
): EmailMessage {
  return {
    to: input.learnerEmail,
    subject: `Your refund for ${input.courseTitle} was approved`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have approved your refund of ${formatPrice(input.amount)} for ${input.courseTitle}.`,
      "",
      "You no longer have access to the course, but your progress is kept in case you buy it again.",
      "",
      "We will email you again when the money has been sent.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export function buildRefundPaidEmail(input: RefundEmailDetails): EmailMessage {
  return {
    to: input.learnerEmail,
    subject: `Your refund for ${input.courseTitle} was paid`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have sent your refund of ${formatPrice(input.amount)} for ${input.courseTitle} back to you.`,
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export function buildRefundPaymentFailedEmail(
  input: Pick<RefundEmailDetails, "learnerName" | "courseTitle" | "amount"> & {
    deciderName: string;
    deciderEmail: string;
    failureMessage: string;
  }
): EmailMessage {
  return {
    to: input.deciderEmail,
    subject: `Refund payment failed for ${input.courseTitle}`,
    body: [
      `Hi ${input.deciderName},`,
      "",
      `The refund payment of ${formatPrice(input.amount)} to ${input.learnerName} for ${input.courseTitle} failed.`,
      "",
      `Reason from the payment provider: ${input.failureMessage}`,
      "",
      "The refund is still approved. Use Retry payment on the refunds screen to try again.",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}
