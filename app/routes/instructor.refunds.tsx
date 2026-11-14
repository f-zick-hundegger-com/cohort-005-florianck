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
  return loadRefundsScreen(request);
}

export async function action({ request }: Route.ActionArgs) {
  return runRefundsScreenAction(request);
}

export default function InstructorRefunds({
  loaderData,
}: Route.ComponentProps) {
  return (
    <RefundsScreen title="Refunds on your courses" requested={loaderData.requested} />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RefundsErrorBoundary error={error} />;
}
