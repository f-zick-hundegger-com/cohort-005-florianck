/**
 * An instructor cannot buy their own course, so they can never end up
 * deciding on a Refund for their own Purchase.
 */
export function canBuyCourse(
  course: { instructorId: number },
  userId: number
): boolean {
  return course.instructorId !== userId;
}
