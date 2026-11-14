import { data } from "react-router";
import { z } from "zod";
import { requireInstructorOrAdmin } from "~/lib/access.server";
import { RefundDecisionError } from "~/lib/refund-decisions.server";
import { getRefundDecisions } from "~/lib/refund-decisions-instance.server";
import { parseFormData } from "~/lib/validation";

// The loader and action behind the refunds screen, shared by the admin and
// instructor routes. Who may see or decide what is the module's business.

const refundIdSchema = z.coerce.number().int().positive();

const refundsActionSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("approve"), refundId: refundIdSchema }),
  z.object({ intent: z.literal("retry"), refundId: refundIdSchema }),
  z.object({
    intent: z.literal("decline"),
    refundId: refundIdSchema,
    declineReason: z
      .string()
      .trim()
      .min(1, "Give the learner a reason for declining."),
  }),
]);

export async function loadRefundsScreen(request: Request) {
  const { userId } = await requireInstructorOrAdmin(request);
  const refundDecisions = getRefundDecisions();
  return {
    requested: refundDecisions.listRequested(userId),
    approvedAndPaid: refundDecisions.listApprovedAndPaid(userId),
  };
}

export async function runRefundsScreenAction(request: Request) {
  const { userId } = await requireInstructorOrAdmin(request);
  const parsed = parseFormData(await request.formData(), refundsActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  const refundDecisions = getRefundDecisions();
  const input = parsed.data;

  try {
    if (input.intent === "approve") {
      await refundDecisions.approve(userId, input.refundId);
      return { success: true, message: "Refund approved." };
    }
    if (input.intent === "retry") {
      await refundDecisions.retryRefundPayment(userId, input.refundId);
      return { success: true, message: "Payment restarted." };
    }
    await refundDecisions.decline(userId, input.refundId, input.declineReason);
  } catch (error) {
    if (error instanceof RefundDecisionError) {
      throw data(error.message, { status: error.status });
    }
    throw error;
  }

  return { success: true, message: "Refund declined." };
}
