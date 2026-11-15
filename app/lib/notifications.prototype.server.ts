// PROTOTYPE — throwaway. Answers "What do Notifications look like in the app?"
// Builds an in-memory list of Notifications from the catalogue (ticket #11),
// using real course / lesson / user names from the local DB. Nothing is stored.
import { eq, ne } from "drizzle-orm";
import { db } from "~/db";
import { courses, lessons, modules, users, UserRole } from "~/db/schema";

export type ProtoSegment = string | { b: string };

export interface ProtoNotification {
  id: string;
  kind: number; // catalogue row
  label: string; // short type label, e.g. "Refund requested"
  text: ProtoSegment[];
  href: string;
  action?: string; // call to action, when the recipient must act
  minutesAgo: number;
  read: boolean;
}

function pickCourse(instructorId?: number) {
  const q = db.select().from(courses);
  const c = instructorId
    ? q.where(eq(courses.instructorId, instructorId)).get()
    : q.get();
  return c ?? db.select().from(courses).get();
}

function pickLesson(courseId: number) {
  return db
    .select({ id: lessons.id, title: lessons.title })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .get();
}

function pickOther(role: UserRole, notId: number) {
  return (
    db
      .select()
      .from(users)
      .where(eq(users.role, role))
      .all()
      .find((u) => u.id !== notId) ??
    db.select().from(users).where(ne(users.id, notId)).get()
  );
}

export function buildPrototypeNotifications(
  user: { id: number; name: string; role: UserRole } | null
): ProtoNotification[] {
  if (!user) return [];
  const course = pickCourse(
    user.role === UserRole.Instructor ? user.id : undefined
  );
  if (!course) return [];
  const lesson = pickLesson(course.id) ?? { id: 0, title: "Welcome" };
  const learner = pickOther(UserRole.Student, user.id)?.name ?? "A learner";
  const instructor =
    db.select().from(users).where(eq(users.id, course.instructorId)).get()
      ?.name ?? "Your instructor";
  const lessonHref = `/courses/${course.slug}/lessons/${lesson.id}`;
  const C = { b: course.title };
  const L = { b: lesson.title };

  if (user.role === UserRole.Student) {
    return [
      { id: "s12", kind: 12, label: "Reminder", text: ["Pick up ", C, " where you left off: next up is ", L, "."], href: lessonHref, action: "Resume lesson", minutesAgo: 25, read: false },
      { id: "s7", kind: 7, label: "Reply", text: [{ b: instructor }, " replied to your question on ", L, "."], href: lessonHref, action: "View reply", minutesAgo: 140, read: false },
      { id: "s2", kind: 2, label: "Refund approved", text: ["Your Refund for ", C, " was approved. ", { b: "$49.00" }, " is on its way back to you."], href: `/courses/${course.slug}`, minutesAgo: 60 * 26, read: false },
      { id: "s3", kind: 3, label: "Refund declined", text: ["Your Refund for ", C, " was declined: ", { b: "more than 30 days since purchase" }, "."], href: `/courses/${course.slug}`, minutesAgo: 60 * 50, read: true },
      { id: "s8", kind: 8, label: "Comment removed", text: ["Your comment on ", L, " was removed."], href: lessonHref, minutesAgo: 60 * 24 * 4, read: true },
      { id: "s10", kind: 10, label: "Role changed", text: ["You are now ", { b: "an instructor" }, "."], href: "/instructor", minutesAgo: 60 * 24 * 9, read: true },
      { id: "s11", kind: 11, label: "Account changed", text: ["An admin changed your account ", { b: "email" }, "."], href: "/settings", minutesAgo: 60 * 24 * 12, read: true },
    ];
  }
  if (user.role === UserRole.Instructor) {
    return [
      { id: "i1", kind: 1, label: "Refund requested", text: [{ b: learner }, " asked for a Refund on ", C, "."], href: "/instructor/refunds", action: "Review Refund", minutesAgo: 8, read: false },
      { id: "i5", kind: 5, label: "Refund payment failed", text: ["Sending ", { b: learner }, "'s Refund for ", C, " failed. Retry it."], href: "/instructor/refunds", action: "Retry payment", minutesAgo: 55, read: false },
      { id: "i6", kind: 6, label: "New question", text: [{ b: learner }, " asked a question on ", L, " in ", C, "."], href: "/instructor/questions", action: "Answer", minutesAgo: 180, read: false },
      { id: "i7", kind: 7, label: "Follow-up", text: [{ b: learner }, " followed up on a question on ", L, "."], href: "/instructor/questions", action: "Answer", minutesAgo: 60 * 20, read: true },
      { id: "i9", kind: 9, label: "Course unpublished", text: ["An admin ", { b: "unpublished" }, " ", C, "."], href: `/instructor/${course.id}`, minutesAgo: 60 * 24 * 3, read: true },
    ];
  }
  // Admin
  return [
    { id: "a5", kind: 5, label: "Refund payment failed", text: ["Sending ", { b: learner }, "'s Refund for ", C, " failed. Retry it."], href: "/admin/refunds", action: "Retry payment", minutesAgo: 14, read: false },
    { id: "a11", kind: 11, label: "Account changed", text: ["An admin changed your account ", { b: "name" }, "."], href: "/settings", minutesAgo: 60 * 30, read: true },
    { id: "a10", kind: 10, label: "Role changed", text: ["You are now ", { b: "an admin" }, "."], href: "/admin/users", minutesAgo: 60 * 24 * 6, read: true },
  ];
}
