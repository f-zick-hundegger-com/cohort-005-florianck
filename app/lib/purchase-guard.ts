import { data } from "react-router";

/**
 * An instructor cannot buy their own course, so they can never end up
 * deciding on a Refund for their own Purchase. Both the purchase page loader
 * and action run this before doing anything else.
 */
export function assertCanBuyCourse(
  course: { instructorId: number },
  userId: number
): void {
  if (course.instructorId === userId) {
    throw data("Instructors cannot buy their own course.", { status: 403 });
  }
}
