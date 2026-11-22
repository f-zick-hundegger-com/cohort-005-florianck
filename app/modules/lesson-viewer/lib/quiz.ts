import { db } from "~/db";
import {
  quizzes,
  quizQuestions,
  quizOptions,
  quizAttempts,
  quizAnswers,
  QuestionType,
} from "~/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

export function getQuizByLessonId(lessonId: number) {
  return db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).get();
}

export function getQuizWithQuestions(quizId: number) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) return null;

  const questions = db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();

  const options = db
    .select()
    .from(quizOptions)
    .where(
      inArray(
        quizOptions.questionId,
        questions.map((question) => question.id)
      )
    )
    .orderBy(asc(quizOptions.id))
    .all();
  const questionsWithOptions = questions.map((question) => ({
    ...question,
    options: options.filter((option) => option.questionId === question.id),
  }));

  return { ...quiz, questions: questionsWithOptions };
}

export function getBestAttempt(userId: number, quizId: number) {
  return db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
}

export function calculateGrade(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

export type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

type QuizQuestion = typeof quizQuestions.$inferSelect;

const GRADED_TYPES: ReadonlySet<QuestionType> = new Set([
  QuestionType.MultipleChoice,
  QuestionType.TrueFalse,
]);

/** The first correct option of each graded question, in one query. */
function findCorrectOptionIds(questions: QuizQuestion[]): Map<number, number> {
  const graded = questions
    .filter((question) => GRADED_TYPES.has(question.questionType))
    .map((question) => question.id);
  const correct = db
    .select()
    .from(quizOptions)
    .where(
      and(
        inArray(quizOptions.questionId, graded),
        eq(quizOptions.isCorrect, true)
      )
    )
    .orderBy(asc(quizOptions.id))
    .all();
  const byQuestion = new Map<number, number>();
  for (const option of correct) {
    if (!byQuestion.has(option.questionId)) {
      byQuestion.set(option.questionId, option.id);
    }
  }
  return byQuestion;
}

function gradeQuestion(
  question: QuizQuestion,
  selected: number | undefined,
  correctOptionIds: Map<number, number>
): QuestionResult {
  if (!selected) {
    return {
      questionId: question.id,
      correct: false,
      selectedOptionId: null,
      correctOptionId: null,
    };
  }
  const correctOptionId = correctOptionIds.get(question.id) ?? null;
  return {
    questionId: question.id,
    correct: selected === correctOptionId,
    selectedOptionId: selected,
    correctOptionId,
  };
}

function recordAttempt(attempt: {
  userId: number;
  quizId: number;
  score: number;
  passed: boolean;
  questionResults: QuestionResult[];
}) {
  const { userId, quizId, score, passed, questionResults } = attempt;
  // The attempt and its answers land together or not at all.
  return db.transaction((tx) => {
    const saved = tx
      .insert(quizAttempts)
      .values({ userId, quizId, score, passed })
      .returning()
      .get();

    for (const result of questionResults) {
      if (result.selectedOptionId !== null) {
        tx.insert(quizAnswers)
          .values({
            attemptId: saved.id,
            questionId: result.questionId,
            selectedOptionId: result.selectedOptionId,
          })
          .run();
      }
    }
    return saved;
  });
}

export function computeResult(
  userId: number,
  quizId: number,
  selectedAnswers: Record<number, number>
) {
  try {
    const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz) {
      console.error("quiz not found");
      return null;
    }

    const questions = db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(quizQuestions.position)
      .all();

    const correctOptionIds = findCorrectOptionIds(questions);
    const questionResults = questions.map((q) =>
      gradeQuestion(q, selectedAnswers[q.id], correctOptionIds)
    );
    const correct = questionResults.filter((r) => r.correct).length;
    const total = questions.length;

    const scoreValue = total > 0 ? correct / total : 0;
    const passed = scoreValue > 0.7;
    const grade = calculateGrade(scoreValue);

    const attempt = recordAttempt({
      userId,
      quizId,
      score: scoreValue,
      passed,
      questionResults,
    });

    return {
      attemptId: attempt.id,
      score: scoreValue,
      passed,
      grade,
      totalCorrect: correct,
      totalQuestions: total,
      questionResults,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
