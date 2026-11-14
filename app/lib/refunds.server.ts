import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db, type Database } from "~/db";
import {
  coupons,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
  purchases,
  refunds,
  RefundStatus,
  videoWatchEvents,
} from "~/db/schema";

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

export type RefundIneligibleReason =
  | "no-purchase"
  | "already-refunded"
  | "claimed-team-seat"
  | "outside-refund-window"
  | "completed-too-much"
  | "watched-too-much";

export type RefundEligibility =
  | {
      eligible: true;
      purchaseId: number;
      refundableAmount: number;
      lastDayInWindow: string;
    }
  | { eligible: false; reason: RefundIneligibleReason };

export type RefundFacts = {
  purchase: { id: number; amountPaid: number; createdAt: string } | null;
  /** The status of every Refund already asked for on this Purchase. */
  refundStatuses: RefundStatus[];
  isClaimedTeamSeat: boolean;
  lessonCount: number;
  completedLessonCount: number;
  secondsWatched: number;
};

// Compare whole days, not hours — a purchase at 23:00 should still get its
// full fourteenth day.
function asDayString(when: Date) {
  const year = when.getFullYear();
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The one place that decides Refund Eligibility. The Refundable Amount is
 * always what the learner actually paid for the Purchase.
 */
export function decideRefundEligibility(
  facts: RefundFacts,
  today: Date
): RefundEligibility {
  const { purchase } = facts;

  if (!purchase) return { eligible: false, reason: "no-purchase" };
  // A Requested Refund is still waiting on us, and an Approved Refund means
  // the money is going back — either way there is nothing left to ask for.
  // Only a Declined Refund lets the learner ask again.
  if (facts.refundStatuses.some((status) => status !== RefundStatus.Declined)) {
    return { eligible: false, reason: "already-refunded" };
  }
  if (facts.isClaimedTeamSeat) {
    return { eligible: false, reason: "claimed-team-seat" };
  }

  const purchasedDay = asDayString(new Date(purchase.createdAt));
  const windowEnd = new Date(purchase.createdAt);
  windowEnd.setDate(windowEnd.getDate() + REFUND_WINDOW_DAYS);
  const lastDayInWindow = asDayString(windowEnd);
  const todayDay = asDayString(today);

  if (todayDay < purchasedDay || todayDay > lastDayInWindow) {
    return { eligible: false, reason: "outside-refund-window" };
  }

  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    return { eligible: false, reason: "completed-too-much" };
  }

  if (facts.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return { eligible: false, reason: "watched-too-much" };
  }

  return {
    eligible: true,
    purchaseId: purchase.id,
    refundableAmount: purchase.amountPaid,
    lastDayInWindow,
  };
}

function getLessonIdsForCourse(db: Database, courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function getCompletedLessonCount(
  db: Database,
  userId: number,
  lessonIds: number[]
) {
  if (lessonIds.length === 0) return 0;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();

  return result?.count ?? 0;
}

function getSecondsWatched(
  db: Database,
  userId: number,
  lessonIds: number[]
) {
  if (lessonIds.length === 0) return 0;

  const furthestPerLesson = db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all();

  return furthestPerLesson.reduce((total, row) => total + row.furthest, 0);
}

export type CourseUsage = {
  secondsWatched: number;
  /** Share of the course's lessons completed, 0 to 1. */
  completion: number;
};

/**
 * What the learner has watched and completed on a course, across all their
 * history on it (not tied to any one Purchase).
 */
export function getCourseUsage(
  database: Database,
  userId: number,
  courseId: number
): CourseUsage {
  const lessonIds = getLessonIdsForCourse(database, courseId);
  const completed = getCompletedLessonCount(database, userId, lessonIds);
  return {
    secondsWatched: getSecondsWatched(database, userId, lessonIds),
    completion: lessonIds.length === 0 ? 0 : completed / lessonIds.length,
  };
}

export function getRefundEligibility(
  userId: number,
  courseId: number,
  today: Date = new Date()
): RefundEligibility {
  const purchase =
    db
      .select()
      .from(purchases)
      .where(
        and(eq(purchases.userId, userId), eq(purchases.courseId, courseId))
      )
      .orderBy(desc(purchases.createdAt))
      .get() ?? null;

  if (!purchase) {
    return decideRefundEligibility(
      {
        purchase: null,
        refundStatuses: [],
        isClaimedTeamSeat: false,
        lessonCount: 0,
        completedLessonCount: 0,
        secondsWatched: 0,
      },
      today
    );
  }

  const refundStatuses = db
    .select({ status: refunds.status })
    .from(refunds)
    .where(eq(refunds.purchaseId, purchase.id))
    .all()
    .map((row) => row.status);

  // A seat that came out of a team licence, and has been claimed, belongs to
  // the team — the learner cannot hand it back on their own.
  const claimedSeat = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.purchaseId, purchase.id), isNotNull(coupons.redeemedAt))
    )
    .get();

  const lessonIds = getLessonIdsForCourse(db, courseId);

  return decideRefundEligibility(
    {
      purchase,
      refundStatuses,
      isClaimedTeamSeat: Boolean(claimedSeat),
      lessonCount: lessonIds.length,
      completedLessonCount: getCompletedLessonCount(db, userId, lessonIds),
      secondsWatched: getSecondsWatched(db, userId, lessonIds),
    },
    today
  );
}
