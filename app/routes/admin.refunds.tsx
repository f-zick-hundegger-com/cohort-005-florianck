import type { Route } from "./+types/admin.refunds";
import {
  loadRefundsScreen,
  runRefundsScreenAction,
} from "~/lib/refunds-screen.server";
import { RefundsErrorBoundary, RefundsScreen } from "~/components/refunds-screen";

export function meta() {
  return [{ title: "Refunds — Cadence" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadRefundsScreen(request, "admin");
}

export async function action({ request }: Route.ActionArgs) {
  return runRefundsScreenAction(request);
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  return (
    <RefundsScreen audience="admin" refunds={loaderData} />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RefundsErrorBoundary error={error} />;
}
