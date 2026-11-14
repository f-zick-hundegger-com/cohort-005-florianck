import { describe, expect, it } from "vitest";
import { canBuyCourse } from "./purchase-guard";

describe("canBuyCourse", () => {
  it("refuses the instructor who owns the course", () => {
    expect(canBuyCourse({ instructorId: 7 }, 7)).toBe(false);
  });

  it("allows anyone else", () => {
    expect(canBuyCourse({ instructorId: 7 }, 8)).toBe(true);
  });
});
