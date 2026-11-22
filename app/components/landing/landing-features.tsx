import { Layers, ListChecks, TrendingUp } from "lucide-react";

const FEATURES = [
  {
    icon: Layers,
    title: "Structured, module by module",
    body: "Every course is broken into modules and short lessons, so you always know what comes next.",
  },
  {
    icon: ListChecks,
    title: "Quizzes that check understanding",
    body: "Test what you just learned before moving on, instead of finding the gaps three lessons later.",
  },
  {
    icon: TrendingUp,
    title: "Progress that keeps your place",
    body: "Pick up exactly where you left off, on your schedule, at your pace.",
  },
];

export function LandingFeatures() {
  return (
    <section className="border-y border-border bg-muted/50">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Built for finishing, not just starting
          </h2>
          <p className="mt-4 text-muted-foreground">
            Cadence gives every course the same shape, so you spend your time
            learning instead of figuring out where you are.
          </p>
        </div>
        <ul className="grid gap-8 sm:grid-cols-3 lg:gap-6">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <div className="flex size-10 items-center justify-center rounded-lg bg-background shadow-sm ring-1 ring-border">
                <feature.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {feature.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
