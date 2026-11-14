import type { Route } from "./+types/instructor.refunds";
import {
  loadRefundsScreen,
  runRefundsScreenAction,
} from "~/lib/refunds-screen.server";
import { RefundsErrorBoundary, RefundsScreen } from "~/components/refunds-screen";

export function meta() {
  return [{ title: "Refunds — Cadence" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadRefundsScreen(request, "instructor");
}

export async function action({ request }: Route.ActionArgs) {
  return runRefundsScreenAction(request);
}

export default function InstructorRefunds({
  loaderData,
}: Route.ComponentProps) {
  return (
    <RefundsScreen audience="instructor" refunds={loaderData} />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RefundsErrorBoundary error={error} />;
}
