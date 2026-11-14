import { describe, expect, it } from "vitest";
import { assertCanBuyCourse } from "./purchase-guard";

function thrownBy(fn: () => void): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("assertCanBuyCourse", () => {
  it("refuses the instructor who owns the course with a 403", () => {
    const thrown = thrownBy(() => assertCanBuyCourse({ instructorId: 7 }, 7));

    expect(thrown).toMatchObject({
      type: "DataWithResponseInit",
      init: { status: 403 },
    });
  });

  it("allows anyone else", () => {
    expect(() => assertCanBuyCourse({ instructorId: 7 }, 8)).not.toThrow();
  });
});
