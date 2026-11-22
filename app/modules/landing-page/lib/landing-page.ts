import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, countDistinct, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  categories,
  courses,
  CourseStatus,
  lessons,
  modules,
  users,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

const SPOTLIGHT_COUNT = 1;
const FEATURED_COURSE_COUNT = 3;

export type FeaturedCourse = {
  id: number;
  title: string;
  slug: string;
  description: string;
  coverImageUrl: string | null;
  instructorName: string;
  categoryName: string;
  lessonCount: number;
};

export type LandingStats = {
  courses: number;
  categories: number;
  lessons: number;
  instructors: number;
};

export type LandingPage = {
  spotlight: FeaturedCourse | null;
  featuredCourses: FeaturedCourse[];
  stats: LandingStats;
};

const isPublished = eq(courses.status, CourseStatus.Published);

function getFeaturedCourses(db: Db) {
  return db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      coverImageUrl: courses.coverImageUrl,
      instructorName: users.name,
      categoryName: categories.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .innerJoin(categories, eq(courses.categoryId, categories.id))
    .where(isPublished)
    .orderBy(desc(courses.createdAt), desc(courses.id))
    .limit(SPOTLIGHT_COUNT + FEATURED_COURSE_COUNT)
    .all();
}

function getLessonCounts(db: Db, courseIds: number[]) {
  const rows = db
    .select({ courseId: modules.courseId, count: sql<number>`count(*)` })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(inArray(modules.courseId, courseIds))
    .groupBy(modules.courseId)
    .all();
  return new Map(rows.map((row) => [row.courseId, row.count]));
}

function getStats(db: Db): LandingStats {
  const [published] = db
    .select({
      courses: countDistinct(courses.id),
      categories: countDistinct(courses.categoryId),
      instructors: countDistinct(courses.instructorId),
    })
    .from(courses)
    .where(isPublished)
    .all();
  const [lessonTotal] = db
    .select({ lessons: sql<number>`count(*)` })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, and(eq(modules.courseId, courses.id), isPublished))
    .all();
  return { ...published, ...lessonTotal };
}

export function getLandingPage(db: Db): LandingPage {
  const featured = getFeaturedCourses(db);
  const lessonCounts = getLessonCounts(
    db,
    featured.map((course) => course.id)
  );
  const [spotlight = null, ...rest] = featured.map((course) => ({
    ...course,
    lessonCount: lessonCounts.get(course.id) ?? 0,
  }));
  return {
    spotlight,
    featuredCourses: rest,
    stats: getStats(db),
  };
}
