import { useEffect, useState } from "react";
import { isRouteErrorResponse, Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { RefundStatus } from "~/db/schema";
import type {
  ApprovedOrPaidRefundRow,
  RequestedRefundRow,
} from "~/lib/refund-decisions.server";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { formatPrice } from "~/lib/utils";

function formatWatchTime(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function formatCompletion(completion: number) {
  return `${Math.round(completion * 100)}%`;
}

function RefundRow({ refund }: { refund: RequestedRefundRow }) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  const [declining, setDeclining] = useState(false);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.message) {
      toast.success(fetcher.data.message);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{refund.learnerName}</p>
            <p className="text-sm text-muted-foreground">
              {refund.courseTitle}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{formatPrice(refund.amountPaid)} paid</p>
            <p className="text-muted-foreground" suppressHydrationWarning>
              Requested {new Date(refund.requestedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <p className="rounded-md bg-muted p-3 text-sm">{refund.reason}</p>

        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium">When requested</dt>
            <dd className="text-muted-foreground">
              {refund.secondsWatchedAtRequest === null ||
              refund.completionAtRequest === null
                ? "Not recorded"
                : `Eligible, ${formatWatchTime(refund.secondsWatchedAtRequest)} watched, ${formatCompletion(refund.completionAtRequest)} complete`}
              {refund.lastDayInWindowAtRequest
                ? `, window ended ${refund.lastDayInWindowAtRequest}`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Today (for information)</dt>
            <dd className="text-muted-foreground">
              {formatWatchTime(refund.current.secondsWatched)} watched,{" "}
              {formatCompletion(refund.current.completion)} complete
            </dd>
          </div>
        </dl>

        {declining ? (
          <fetcher.Form method="post" className="space-y-2">
            <input type="hidden" name="intent" value="decline" />
            <input type="hidden" name="refundId" value={refund.refundId} />
            <Textarea
              name="declineReason"
              required
              placeholder="Tell the learner why this refund is declined"
              aria-label="Reason for declining"
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={fetcher.state !== "idle"}
              >
                Decline refund
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeclining(false)}
              >
                Cancel
              </Button>
            </div>
          </fetcher.Form>
        ) : (
          <div className="flex gap-2">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="approve" />
              <input type="hidden" name="refundId" value={refund.refundId} />
              <Button
                type="submit"
                size="sm"
                disabled={fetcher.state !== "idle"}
              >
                Approve
              </Button>
            </fetcher.Form>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeclining(true)}
            >
              Decline
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApprovedRefundRow({ refund }: { refund: ApprovedOrPaidRefundRow }) {
  const fetcher = useFetcher<{ success?: boolean; message?: string }>();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.message) {
      toast.success(fetcher.data.message);
    }
  }, [fetcher.state, fetcher.data]);
  const isPaid = refund.status === RefundStatus.Paid;
  return (
    <Card>
      <CardContent className="space-y-1 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{refund.learnerName}</p>
            <p className="text-muted-foreground">{refund.courseTitle}</p>
          </div>
          <div className="text-right">
            <p className="font-medium">
              {formatPrice(refund.amountRefunded ?? 0)} refunded
            </p>
            <span
              className={
                isPaid
                  ? "rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800"
                  : "rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
              }
            >
              {isPaid ? "Paid" : "Approved"}
            </span>
          </div>
        </div>
        <p className="text-muted-foreground" suppressHydrationWarning>
          {refund.payment
            ? `Payment ${refund.payment.status} via ${refund.payment.provider}` +
              (refund.payment.providerReference
                ? ` (${refund.payment.providerReference})`
                : "")
            : "No payment started"}
          {refund.paidAt
            ? `, paid ${new Date(refund.paidAt).toLocaleString()}`
            : ""}
        </p>
        {refund.payment?.failureMessage ? (
          <p className="text-destructive">
            Payment failed: {refund.payment.failureMessage}
          </p>
        ) : null}
        {refund.canRetry ? (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="retry" />
            <input type="hidden" name="refundId" value={refund.refundId} />
            <Button
              type="submit"
              size="sm"
              disabled={fetcher.state !== "idle"}
            >
              Retry payment
            </Button>
          </fetcher.Form>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function RefundsScreen({
  title,
  requested,
  approvedAndPaid,
}: {
  title: string;
  requested: RequestedRefundRow[];
  approvedAndPaid: ApprovedOrPaidRefundRow[];
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">
          Requested refunds, oldest first.
        </p>
      </div>
      {requested.length === 0 ? (
        <p className="text-muted-foreground">No requested refunds.</p>
      ) : (
        <div className="space-y-4">
          {requested.map((refund) => (
            <RefundRow key={refund.refundId} refund={refund} />
          ))}
        </div>
      )}
      <div>
        <h2 className="text-lg font-semibold">Approved and paid</h2>
        <p className="text-muted-foreground">
          Approved refunds turn Paid when the Payment Provider confirms.
        </p>
      </div>
      {approvedAndPaid.length === 0 ? (
        <p className="text-muted-foreground">No approved refunds yet.</p>
      ) : (
        <div className="space-y-4">
          {approvedAndPaid.map((refund) => (
            <ApprovedRefundRow key={refund.refundId} refund={refund} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RefundsErrorBoundary({ error }: { error: unknown }) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading refunds.";

  if (isRouteErrorResponse(error)) {
    title = error.status === 403 ? "Access denied" : `Error ${error.status}`;
    message = typeof error.data === "string" ? error.data : error.statusText;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
