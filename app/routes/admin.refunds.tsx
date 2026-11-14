import { data } from "react-router";
import type { Route } from "./+types/admin.refunds";
import { requireInstructorOrAdmin } from "~/lib/access.server";
import {
  loadRefundsScreen,
  runRefundsScreenAction,
} from "~/lib/refunds-screen.server";
import { RefundsErrorBoundary, RefundsScreen } from "~/components/refunds-screen";

export function meta() {
  return [{ title: "Refunds — Cadence" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { isAdmin } = await requireInstructorOrAdmin(request);
  if (!isAdmin) {
    throw data("Only admins can access this page.", { status: 403 });
  }
  return loadRefundsScreen(request);
}

export async function action({ request }: Route.ActionArgs) {
  return runRefundsScreenAction(request);
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  return (
    <RefundsScreen
      title="Refunds"
      requested={loaderData.requested}
      approvedAndPaid={loaderData.approvedAndPaid}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RefundsErrorBoundary error={error} />;
}
