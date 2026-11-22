import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import { createLandingPage, FEATURED_COURSE_LIMIT } from "../index.server";

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function landing() {
  return createLandingPage(db).get();
}

// ─── Fixtures ───
// The module only reads, so rows go in directly. Kept in one place so a
// schema change touches only this block.

let counter = 0;

function addInstructor(name: string) {
  counter++;
  return db
    .insert(schema.users)
    .values({
      name,
      email: `instructor-${counter}@example.com`,
      role: UserRole.Instructor,
    })
    .returning()
    .get();
}

function addCategory(name: string) {
  counter++;
  return db
    .insert(schema.categories)
    .values({ name, slug: `category-${counter}` })
    .returning()
    .get();
}

function addCourse(
  title: string,
  options: {
    status?: CourseStatus;
    createdAt?: string;
    instructorId?: number;
    categoryId?: number;
  } = {}
) {
  counter++;
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: `course-${counter}`,
      description: `${title} description`,
      salesCopy: markdown(`## ${title}`),
      instructorId: options.instructorId ?? base.instructor.id,
      categoryId: options.categoryId ?? base.category.id,
      status: options.status ?? CourseStatus.Published,
      createdAt: options.createdAt ?? new Date().toISOString(),
    })
    .returning()
    .get();
}

function addLessons(courseId: number, perModule: number[]) {
  perModule.forEach((count, moduleIndex) => {
    const mod = db
      .insert(schema.modules)
      .values({
        courseId,
        title: `Module ${moduleIndex}`,
        position: moduleIndex,
      })
      .returning()
      .get();
    for (let i = 0; i < count; i++) {
      db.insert(schema.lessons)
        .values({ moduleId: mod.id, title: `Lesson ${i}`, position: i })
        .run();
    }
  });
}

function titlesOnPage() {
  const page = landing();
  return {
    spotlight: page.spotlight?.title ?? null,
    featured: page.featuredCourses.map((c) => c.title),
  };
}

describe("spotlight and featured courses", () => {
  it("spotlights the newest published course and features the next three", () => {
    addCourse("Oldest", { createdAt: "2000-01-01T00:00:00.000Z" });
    addCourse("Newest", { createdAt: "2030-01-01T00:00:00.000Z" });
    addCourse("Newer", { createdAt: "2029-01-01T00:00:00.000Z" });
    addCourse("New", { createdAt: "2028-01-01T00:00:00.000Z" });

    expect(FEATURED_COURSE_LIMIT).toBe(3);
    expect(titlesOnPage()).toEqual({
      spotlight: "Newest",
      featured: ["Newer", "New", "Test Course"],
    });
  });

  it("leaves out courses that are not published", () => {
    addCourse("Draft", { status: CourseStatus.Draft });
    addCourse("Archived", { status: CourseStatus.Archived });

    expect(titlesOnPage()).toEqual({ spotlight: "Test Course", featured: [] });
  });

  it("carries the instructor, category and cover of each course", () => {
    expect(landing().spotlight).toMatchObject({
      id: base.course.id,
      slug: "test-course",
      description: "A test course",
      coverImageUrl: null,
      instructorName: "Test Instructor",
      categoryName: "Programming",
    });
  });

  it("counts every lesson across a course's modules", () => {
    const other = addCourse("Other", {
      createdAt: "2000-01-01T00:00:00.000Z",
    });
    addLessons(base.course.id, [2, 3]);
    addLessons(other.id, [4]);

    const page = landing();

    expect(page.spotlight?.lessonCount).toBe(5);
    expect(page.featuredCourses[0].lessonCount).toBe(4);
  });

  it("gives a course without lessons a count of zero", () => {
    expect(landing().spotlight?.lessonCount).toBe(0);
  });

  it("is empty when nothing is published", () => {
    db.update(schema.courses).set({ status: CourseStatus.Draft }).run();

    expect(titlesOnPage()).toEqual({ spotlight: null, featured: [] });
  });
});

describe("stats", () => {
  it("counts only what published courses bring", () => {
    const secondInstructor = addInstructor("Second Instructor");
    const secondCategory = addCategory("Design");
    const unusedCategory = addCategory("Unused");
    const draftInstructor = addInstructor("Draft Instructor");
    addCourse("Second", {
      instructorId: secondInstructor.id,
      categoryId: secondCategory.id,
    });
    addCourse("Same instructor and category");
    const draft = addCourse("Draft", {
      status: CourseStatus.Draft,
      instructorId: draftInstructor.id,
      categoryId: unusedCategory.id,
    });
    addLessons(base.course.id, [2, 1]);
    addLessons(draft.id, [7]);

    expect(landing().stats).toEqual({
      courses: 3,
      categories: 2,
      instructors: 2,
      lessons: 3,
    });
  });

  it("is all zeros when nothing is published", () => {
    db.update(schema.courses).set({ status: CourseStatus.Draft }).run();

    expect(landing().stats).toEqual({
      courses: 0,
      categories: 0,
      instructors: 0,
      lessons: 0,
    });
  });
});
