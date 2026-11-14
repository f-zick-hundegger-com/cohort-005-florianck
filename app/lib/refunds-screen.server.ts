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

export type RefundsScreenAudience = "admin" | "instructor";

/** Admins use /admin/refunds, instructors /instructor/refunds. */
export function assertMayUseRefundsScreen(
  audience: RefundsScreenAudience,
  isAdmin: boolean
) {
  if (audience === "admin" && !isAdmin) {
    throw data("Only admins can access this page.", { status: 403 });
  }
  if (audience === "instructor" && isAdmin) {
    throw data("Only instructors can access this page.", { status: 403 });
  }
}

export async function loadRefundsScreen(
  request: Request,
  audience: RefundsScreenAudience
) {
  const { userId, isAdmin } = await requireInstructorOrAdmin(request);
  assertMayUseRefundsScreen(audience, isAdmin);
  const refundDecisions = getRefundDecisions();
  return {
    requested: refundDecisions.listRequested(userId),
    approvedAndPaid: refundDecisions.listApprovedAndPaid(userId),
  };
}

/** Throws a 400 carrying the first problem when the submission is invalid. */
export function parseRefundsScreenAction(formData: FormData) {
  const parsed = parseFormData(formData, refundsActionSchema);
  if (!parsed.success) {
    const [firstError] = Object.values(parsed.errors);
    throw data(firstError ?? "Invalid submission.", { status: 400 });
  }
  return parsed.data;
}

export async function runRefundsScreenAction(request: Request) {
  const { userId } = await requireInstructorOrAdmin(request);
  const input = parseRefundsScreenAction(await request.formData());
  const refundDecisions = getRefundDecisions();

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
