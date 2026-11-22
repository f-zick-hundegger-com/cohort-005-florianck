import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "~/components/ui/button";
import { CourseImage } from "~/components/course-image";
import { CourseMeta } from "~/components/landing/course-meta";
import type { FeaturedCourse, LandingStats } from "~/modules/landing-page";

type LandingHeroProps = {
  stats: LandingStats;
  spotlight: FeaturedCourse | null;
  signedIn: boolean;
};

export function LandingHero({ stats, spotlight, signedIn }: LandingHeroProps) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,var(--color-muted)_0,transparent_55%)]"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-28">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Self-paced courses for developers
          </p>
          <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            Learn to code,
            <br />
            <span className="text-muted-foreground">at your own pace.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Structured courses built by experienced instructors. Track your
            progress, take quizzes, and build real-world skills.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/courses">
                Browse Courses
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              {signedIn ? (
                <Link to="/dashboard">Go to your dashboard</Link>
              ) : (
                <Link to="/signup">Create a free account</Link>
              )}
            </Button>
          </div>
          <HeroStats stats={stats} />
        </div>
        {spotlight && <Spotlight course={spotlight} />}
      </div>
    </section>
  );
}

function HeroStats({ stats }: { stats: LandingStats }) {
  const items = [
    { value: stats.courses, label: "Courses" },
    { value: stats.lessons, label: "Lessons" },
    { value: stats.instructors, label: "Instructors" },
    { value: stats.categories, label: "Categories" },
  ];
  return (
    <dl className="mt-14 grid max-w-xl grid-cols-2 gap-6 border-t border-border pt-8 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-3xl font-bold tracking-tight">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Spotlight({ course }: { course: FeaturedCourse }) {
  return (
    <div className="relative mx-auto w-full max-w-md lg:mx-0">
      <div
        aria-hidden
        className="absolute inset-0 translate-x-4 translate-y-4 rotate-3 rounded-xl border border-border bg-muted"
      />
      <Link
        to={`/courses/${course.slug}`}
        className="group relative block overflow-hidden rounded-xl border border-border bg-card shadow-xl transition-transform hover:-translate-y-1"
      >
        <CourseImage
          src={course.coverImageUrl}
          alt={course.title}
          className="aspect-video w-full object-cover"
        />
        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Newest course · {course.categoryName}
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-snug group-hover:underline">
            {course.title}
          </h2>
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
            {course.description}
          </p>
          <CourseMeta course={course} className="mt-4 gap-4" />
        </div>
      </Link>
    </div>
  );
}
