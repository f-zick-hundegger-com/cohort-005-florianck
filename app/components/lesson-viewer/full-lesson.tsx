import { useAutoplay } from "./use-autoplay";
import { CurriculumSidebar } from "./curriculum-sidebar";
import { LessonBreadcrumb } from "./lesson-breadcrumb";
import {
  LessonCompletion,
  LessonHeading,
  LessonPager,
  LessonQuiz,
} from "./lesson-sections";
import type { Route } from "../../routes/+types/courses.$slug.lessons.$lessonId";
import { CommentThread } from "~/components/comment-thread";
import { LessonNote } from "~/components/lesson-note";
import { Card, CardContent } from "~/components/ui/card";
import { YouTubePlayer } from "~/components/youtube-player";

export type LessonLoaderData = Route.ComponentProps["loaderData"];
export type FullLessonData = Extract<LessonLoaderData, { view: "full" }>;

export function FullLesson({ data }: { data: FullLessonData }) {
  const {
    course,
    curriculum,
    module: mod,
    lesson,
    enrolled,
    currentUserId,
    lessonProgressMap,
    bookmarked,
  } = data;
  return (
    <div className="flex">
      {/* Curriculum Sidebar */}
      <CurriculumSidebar
        course={course}
        curriculum={curriculum}
        currentLessonId={lesson.id}
        lessonProgressMap={lessonProgressMap}
        enrolled={enrolled}
      />

      <div className="flex-1 p-6 lg:p-8">
        <LessonBreadcrumb
          course={course}
          mod={mod}
          lessonTitle={lesson.title}
        />

        <div className="mx-auto max-w-4xl">
          <LessonHeading
            lesson={lesson}
            bookmarked={currentUserId ? bookmarked : null}
          />

          <LessonMedia data={data} />

          <LessonActivity data={data} />
        </div>
      </div>
    </div>
  );
}

/** The video, the Student's note and the lesson body, in reading order. */
function LessonMedia({ data }: { data: FullLessonData }) {
  const {
    lesson,
    contentHtml,
    enrolled,
    currentUserId,
    lastWatchPosition,
    watchProgress,
    note,
  } = data;
  const [autoplay, toggleAutoplay] = useAutoplay();

  return (
    <>
      {/* YouTube Video */}
      {lesson.videoUrl && (
        <YouTubePlayer
          videoUrl={lesson.videoUrl}
          lessonId={lesson.id}
          title={lesson.title}
          startPosition={lastWatchPosition}
          durationMinutes={lesson.durationMinutes}
          watchProgress={watchProgress}
          trackingEnabled={enrolled && !!currentUserId}
          autoplay={autoplay}
          onToggleAutoplay={toggleAutoplay}
        />
      )}

      {/* Note — under the video, so the Student can write while they watch */}
      {currentUserId && <LessonNote key={lesson.id} note={note} />}

      {/* Lesson Content */}
      {contentHtml && (
        <div
          className="prose prose-neutral dark:prose-invert mb-8 max-w-none"
          // oxlint-disable-next-line react/no-danger -- the instructor wrote this Markdown
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />
      )}

      {!contentHtml && !lesson.videoUrl && (
        <Card className="mb-8">
          <CardContent className="py-12 text-center text-muted-foreground">
            No content has been added to this lesson yet.
          </CardContent>
        </Card>
      )}
    </>
  );
}

function LessonActivity({ data }: { data: FullLessonData }) {
  const {
    course,
    lesson,
    lessonStatus,
    enrolled,
    currentUserId,
    prevLesson,
    nextLesson,
    quiz,
    bestAttempt,
    comments,
    canModerate,
    instructorName,
  } = data;

  return (
    <>
      {quiz && enrolled && currentUserId && (
        <LessonQuiz
          lessonId={lesson.id}
          quiz={quiz}
          bestAttempt={bestAttempt}
        />
      )}

      {enrolled && currentUserId && (
        <LessonCompletion
          courseSlug={course.slug}
          lessonId={lesson.id}
          lessonStatus={lessonStatus}
          nextLesson={nextLesson}
        />
      )}

      {/* Questions & Discussion — confidential to people with access */}
      <CommentThread
        comments={comments}
        currentUserId={currentUserId}
        canModerate={canModerate}
        canPost
        instructorName={instructorName}
      />

      <LessonPager
        courseSlug={course.slug}
        courseTitle={course.title}
        prevLesson={prevLesson}
        nextLesson={nextLesson}
      />
    </>
  );
}
