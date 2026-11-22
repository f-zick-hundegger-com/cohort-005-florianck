import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { QuestionType } from "~/db/schema";
import { markdown } from "~/lib/text";

// The lesson-viewer queries read the app's shared `db`; point it at a fresh
// in-memory database for each test.
let db: TestDb;
vi.mock("~/db", () => ({
  get db() {
    return db;
  },
}));

const {
  computeResult,
  getQuizWithQuestions,
  getCourseWithDetails,
  getLessonThread,
  flattenCourseLessons,
  getLessonProgressForCourse,
  markLessonComplete,
  markLessonInProgress,
} = await import("../index.server");

let base: ReturnType<typeof seedBaseData>;

function addModule(title: string, position: number) {
  return db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title, position })
    .returning()
    .get();
}

function addLesson(moduleId: number, title: string, position: number) {
  return db
    .insert(schema.lessons)
    .values({ moduleId, title, position })
    .returning()
    .get();
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

describe("getCourseWithDetails", () => {
  it("returns null for an unknown course", () => {
    expect(getCourseWithDetails(9999)).toBeNull();
  });

  it("nests each module's lessons, both in position order", () => {
    const second = addModule("Second", 2);
    const first = addModule("First", 1);
    addLesson(first.id, "B", 2);
    addLesson(first.id, "A", 1);
    addLesson(second.id, "C", 1);

    const course = getCourseWithDetails(base.course.id);

    expect(course?.instructorName).toBe("Test Instructor");
    expect(
      course?.modules.map((m) => [m.title, m.lessons.map((l) => l.title)])
    ).toEqual([
      ["First", ["A", "B"]],
      ["Second", ["C"]],
    ]);
  });

  it("gives a course with no modules an empty outline", () => {
    expect(getCourseWithDetails(base.course.id)?.modules).toEqual([]);
  });

  it("flattens the outline into one list for prev/next", () => {
    const mod = addModule("Only", 1);
    addLesson(mod.id, "One", 1);
    addLesson(mod.id, "Two", 2);

    const course = getCourseWithDetails(base.course.id);
    const flat = course ? flattenCourseLessons(course) : [];

    expect(flat.map((l) => [l.title, l.moduleTitle])).toEqual([
      ["One", "Only"],
      ["Two", "Only"],
    ]);
  });
});

describe("getLessonThread", () => {
  let lessonId: number;

  function addComment(values: {
    userId: number;
    body: string;
    createdAt: string;
    parentId?: number;
    deletedAt?: string;
  }) {
    return db
      .insert(schema.comments)
      .values({ lessonId, ...values, body: markdown(values.body) })
      .returning()
      .get();
  }

  beforeEach(() => {
    lessonId = addLesson(addModule("M", 1).id, "L", 1).id;
  });

  it("nests replies under their question and marks the instructor", () => {
    const question = addComment({
      userId: base.user.id,
      body: "Why?",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    addComment({
      userId: base.instructor.id,
      body: "Because.",
      createdAt: "2026-01-02T00:00:00.000Z",
      parentId: question.id,
    });

    const thread = getLessonThread(lessonId);

    expect(thread).toHaveLength(1);
    expect(thread[0].body).toBe("Why?");
    expect(thread[0].author.isInstructor).toBe(false);
    expect(thread[0].replies.map((r) => r.body)).toEqual(["Because."]);
    expect(thread[0].replies[0].author.isInstructor).toBe(true);
  });

  it("blanks a deleted question that still has replies", () => {
    const question = addComment({
      userId: base.user.id,
      body: "Secret",
      createdAt: "2026-01-01T00:00:00.000Z",
      deletedAt: "2026-01-03T00:00:00.000Z",
    });
    addComment({
      userId: base.instructor.id,
      body: "Answer",
      createdAt: "2026-01-02T00:00:00.000Z",
      parentId: question.id,
    });

    const [shown] = getLessonThread(lessonId);

    expect(shown.deleted).toBe(true);
    expect(shown.body).toBe("");
    expect(shown.replies).toHaveLength(1);
  });

  it("hides a deleted reply and flags an admin author", () => {
    const admin = db
      .insert(schema.users)
      .values({
        name: "Admin",
        email: "admin@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();
    const question = addComment({
      userId: admin.id,
      body: "Pinned",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    addComment({
      userId: base.user.id,
      body: "Removed reply",
      createdAt: "2026-01-02T00:00:00.000Z",
      parentId: question.id,
      deletedAt: "2026-01-03T00:00:00.000Z",
    });

    const [shown] = getLessonThread(lessonId);

    expect(shown.author.isPlatformAdmin).toBe(true);
    expect(shown.replies).toEqual([]);
  });

  it("drops a deleted question with no replies", () => {
    addComment({
      userId: base.user.id,
      body: "Gone",
      createdAt: "2026-01-01T00:00:00.000Z",
      deletedAt: "2026-01-03T00:00:00.000Z",
    });

    expect(getLessonThread(lessonId)).toEqual([]);
  });
});

describe("markLessonComplete", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");

  it("completes a lesson the Student never opened, at the given time", () => {
    const lessonId = addLesson(addModule("M", 1).id, "L", 1).id;

    expect(markLessonComplete(base.user.id, lessonId, now)).toMatchObject({
      status: schema.LessonProgressStatus.Completed,
      completedAt: now.toISOString(),
    });
  });

  it("completes a lesson already in progress, keeping one row", () => {
    const lessonId = addLesson(addModule("M", 1).id, "L", 1).id;
    markLessonInProgress(base.user.id, lessonId);

    markLessonComplete(base.user.id, lessonId, now);

    expect(getLessonProgressForCourse(base.user.id, base.course.id)).toEqual([
      expect.objectContaining({
        lessonId,
        status: schema.LessonProgressStatus.Completed,
        completedAt: now.toISOString(),
      }),
    ]);
  });
});

describe("getLessonProgressForCourse", () => {
  it("returns only this course's progress for this Student", () => {
    const moduleId = addModule("M", 1).id;
    const first = addLesson(moduleId, "A", 1).id;
    const second = addLesson(moduleId, "B", 2).id;
    markLessonInProgress(base.user.id, first);
    markLessonInProgress(base.instructor.id, second);

    expect(
      getLessonProgressForCourse(base.user.id, base.course.id).map(
        (p) => p.lessonId
      )
    ).toEqual([first]);
  });

  it("returns nothing for a course with no modules", () => {
    expect(getLessonProgressForCourse(base.user.id, base.course.id)).toEqual(
      []
    );
  });
});

describe("computeResult", () => {
  let quizId: number;
  let correct: number[];
  let wrong: number[];

  function addQuestion(type: QuestionType, position: number) {
    const question = db
      .insert(schema.quizQuestions)
      .values({
        quizId,
        questionText: `Q${position}`,
        questionType: type,
        position,
      })
      .returning()
      .get();
    const [right, other] = [true, false].map(
      (isCorrect) =>
        db
          .insert(schema.quizOptions)
          .values({
            questionId: question.id,
            optionText: String(isCorrect),
            isCorrect,
          })
          .returning()
          .get().id
    );
    return { questionId: question.id, right, other };
  }

  let questions: Array<{ questionId: number; right: number; other: number }>;

  beforeEach(() => {
    const lessonId = addLesson(addModule("M", 1).id, "L", 1).id;
    quizId = db
      .insert(schema.quizzes)
      .values({ lessonId, title: "Quiz", passingScore: 0.7 })
      .returning()
      .get().id;
    questions = [
      addQuestion(QuestionType.MultipleChoice, 1),
      addQuestion(QuestionType.TrueFalse, 2),
      addQuestion(QuestionType.MultipleChoice, 3),
    ];
    correct = questions.map((q) => q.right);
    wrong = questions.map((q) => q.other);
  });

  function answers(optionIds: Array<number | undefined>) {
    const selected: Record<number, number> = {};
    questions.forEach((q, i) => {
      const optionId = optionIds[i];
      if (optionId !== undefined) selected[q.questionId] = optionId;
    });
    return selected;
  }

  it("passes a quiz answered all correctly and records the attempt", () => {
    const result = computeResult(base.user.id, quizId, answers(correct));

    expect(result).toMatchObject({
      score: 1,
      passed: true,
      grade: "A",
      totalCorrect: 3,
      totalQuestions: 3,
    });
    const attempt = db.select().from(schema.quizAttempts).all();
    expect(attempt).toEqual([
      expect.objectContaining({
        id: result?.attemptId,
        score: 1,
        passed: true,
      }),
    ]);
    expect(db.select().from(schema.quizAnswers).all()).toHaveLength(3);
  });

  it("grades each question, both multiple choice and true/false", () => {
    const result = computeResult(
      base.user.id,
      quizId,
      answers([correct[0], wrong[1], undefined])
    );

    expect(result?.questionResults).toEqual([
      {
        questionId: questions[0].questionId,
        correct: true,
        selectedOptionId: correct[0],
        correctOptionId: correct[0],
      },
      {
        questionId: questions[1].questionId,
        correct: false,
        selectedOptionId: wrong[1],
        correctOptionId: correct[1],
      },
      {
        questionId: questions[2].questionId,
        correct: false,
        selectedOptionId: null,
        correctOptionId: null,
      },
    ]);
    expect(result).toMatchObject({
      totalCorrect: 1,
      passed: false,
      grade: "F",
    });
  });

  it("fails two out of three with a D", () => {
    const result = computeResult(
      base.user.id,
      quizId,
      answers([correct[0], correct[1], wrong[2]])
    );

    expect(result).toMatchObject({
      totalCorrect: 2,
      passed: false,
      grade: "D",
    });
  });

  it("stores only the questions that were answered", () => {
    computeResult(base.user.id, quizId, answers([correct[0]]));

    expect(db.select().from(schema.quizAnswers).all()).toEqual([
      expect.objectContaining({
        questionId: questions[0].questionId,
        selectedOptionId: correct[0],
      }),
    ]);
  });

  it("scores a quiz with no questions as zero", () => {
    const emptyQuizId = db
      .insert(schema.quizzes)
      .values({
        lessonId: addLesson(addModule("M2", 2).id, "L2", 1).id,
        title: "Empty",
        passingScore: 0.7,
      })
      .returning()
      .get().id;

    expect(computeResult(base.user.id, emptyQuizId, {})).toMatchObject({
      score: 0,
      totalQuestions: 0,
      questionResults: [],
    });
  });

  it("gives each question its own options, in question order", () => {
    const quiz = getQuizWithQuestions(quizId);

    expect(
      quiz?.questions.map((q) => ({
        id: q.id,
        options: q.options.map((o) => o.id),
      }))
    ).toEqual(
      questions.map((q) => ({ id: q.questionId, options: [q.right, q.other] }))
    );
  });

  it("returns null for an unknown quiz", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(computeResult(base.user.id, 9999, {})).toBeNull();
  });
});
