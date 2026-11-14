import { data } from "react-router";
import { z } from "zod";
import { db } from "~/db";
import { requireInstructorOrAdmin } from "~/lib/access.server";
import {
  createRefundDecisions,
  logEmail,
  RefundDecisionError,
} from "~/lib/refund-decisions.server";
import { parseFormData } from "~/lib/validation";

// The loader and action behind the refunds screen, shared by the admin and
// instructor routes. Who may see or decide what is the module's business.

function getRefundDecisions() {
  return createRefundDecisions({
    db,
    sendEmail: logEmail,
    now: () => new Date(),
  });
}

const refundsActionSchema = z.object({
  intent: z.literal("decline"),
  refundId: z.coerce.number().int().positive(),
  declineReason: z
    .string()
    .trim()
    .min(1, "Give the learner a reason for declining."),
});

export async function loadRefundsScreen(request: Request) {
  const { userId } = await requireInstructorOrAdmin(request);
  return { requested: getRefundDecisions().listRequested(userId) };
}

export async function runRefundsScreenAction(request: Request) {
  const { userId } = await requireInstructorOrAdmin(request);
  const parsed = parseFormData(await request.formData(), refundsActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  try {
    await getRefundDecisions().decline(
      userId,
      parsed.data.refundId,
      parsed.data.declineReason
    );
  } catch (error) {
    if (error instanceof RefundDecisionError) {
      throw data(error.message, { status: error.status });
    }
    throw error;
  }

  return { success: true, message: "Refund declined." };
}
