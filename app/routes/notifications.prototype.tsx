// PROTOTYPE (ticket #13): full-page inbox used by Notifications variant B.
import { Link, useOutletContext } from "react-router";
import { VariantBInbox, type ProtoState } from "~/components/notifications.prototype";

export default function NotificationsPrototype() {
  const s = useOutletContext<ProtoState>();
  if (s.variant !== "B") {
    return (
      <div className="p-10 text-sm text-muted-foreground">
        The inbox page only exists in variant B.{" "}
        <Link to="?variant=B" className="text-primary underline">Switch to B</Link>
      </div>
    );
  }
  return <VariantBInbox s={s} />;
}
