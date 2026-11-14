import { describe, expect, it } from "vitest";
import {
  assertMayUseRefundsScreen,
  parseRefundsScreenAction,
} from "./refunds-screen.server";

function form(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("reading a refunds screen submission", () => {
  it("returns the decision the form asked for", () => {
    expect(
      parseRefundsScreenAction(
        form({ intent: "decline", refundId: "4", declineReason: "Too late." })
      )
    ).toEqual({ intent: "decline", refundId: 4, declineReason: "Too late." });
  });

  it("throws a 400 for an invalid submission", () => {
    expect(() =>
      parseRefundsScreenAction(
        form({ intent: "decline", refundId: "4", declineReason: "  " })
      )
    ).toThrow(
      expect.objectContaining({
        init: { status: 400 },
        data: "Give the learner a reason for declining.",
      })
    );
  });
});

describe("who may open a refunds screen", () => {
  it("keeps admins off the instructor screen and instructors off the admin screen", () => {
    expect(() => assertMayUseRefundsScreen("instructor", true)).toThrow(
      expect.objectContaining({ init: { status: 403 } })
    );
    expect(() => assertMayUseRefundsScreen("admin", false)).toThrow(
      expect.objectContaining({ init: { status: 403 } })
    );
  });

  it("lets each in on their own screen", () => {
    expect(() => assertMayUseRefundsScreen("instructor", false)).not.toThrow();
    expect(() => assertMayUseRefundsScreen("admin", true)).not.toThrow();
  });
});
