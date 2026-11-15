// PROTOTYPE — throwaway, lives only on branch prototype/notifications-look.
// Question (ticket #13): "What do Notifications look like in the app?"
// Three variants, switchable via ?variant=A|B|C and the floating bar:
//   A  Bell + dropdown   — bell in the sidebar header, compact popover list
//   B  Inbox page        — "Notifications" sidebar item, full page, list + detail
//   C  Action drawer     — slide-over from the right, grouped "Needs you" / "FYI"
// ?empty=1 shows the empty state. Read state is in memory only.
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Popover } from "radix-ui";
import {
  Bell,
  BellOff,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessageSquare,
  ShieldAlert,
  Undo2,
  UserCog,
  X,
  Inbox,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import type {
  ProtoNotification,
  ProtoSegment,
} from "~/lib/notifications.prototype.server";

export const VARIANTS = [
  { key: "A", name: "Bell + dropdown" },
  { key: "B", name: "Inbox page" },
  { key: "C", name: "Action drawer" },
] as const;
export type VariantKey = (typeof VARIANTS)[number]["key"];

// ---------- shared state ----------

export function useProtoNotifications(initial: ProtoNotification[]) {
  const [params] = useSearchParams();
  const [items, setItems] = useState(initial);
  const fromUrl = params.get("variant");
  const [variant, setVariant] = useState<VariantKey>(
    VARIANTS.some((x) => x.key === fromUrl) ? (fromUrl as VariantKey) : "A"
  );
  const [empty, setEmpty] = useState(params.get("empty") === "1");

  useEffect(() => setItems(initial), [initial]);
  // The layout stays mounted across navigations, so remember the last
  // variant seen in the URL even when a sidebar link drops the param.
  useEffect(() => {
    const v = params.get("variant");
    if (v && VARIANTS.some((x) => x.key === v)) setVariant(v as VariantKey);
    if (params.has("empty")) setEmpty(params.get("empty") === "1");
  }, [params]);

  const shown = empty ? [] : items;
  return {
    variant,
    empty,
    items: shown,
    unread: shown.filter((n) => !n.read).length,
    markRead: (id: string) =>
      setItems((xs) => xs.map((n) => (n.id === id ? { ...n, read: true } : n))),
    markUnread: (id: string) =>
      setItems((xs) => xs.map((n) => (n.id === id ? { ...n, read: false } : n))),
    markAllRead: () => setItems((xs) => xs.map((n) => ({ ...n, read: true }))),
  };
}
export type ProtoState = ReturnType<typeof useProtoNotifications>;

// ---------- small shared bits ----------

function timeAgo(m: number) {
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 60 / 24)}d ago`;
}

function Text({ parts }: { parts: ProtoSegment[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : (
          <strong key={i} className="font-semibold text-foreground">
            {p.b}
          </strong>
        )
      )}
    </>
  );
}

function KindIcon({ kind, className }: { kind: number; className?: string }) {
  const c = cn("size-4", className);
  if (kind <= 5) return <Undo2 className={c} />;
  if (kind <= 7) return <MessageSquare className={c} />;
  if (kind <= 9) return <ShieldAlert className={c} />;
  if (kind <= 11) return <UserCog className={c} />;
  return <Clock className={c} />;
}

function CountBadge({ n, className }: { n: number; className?: string }) {
  if (n === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground",
        className
      )}
    >
      {n > 9 ? "9+" : n}
    </span>
  );
}

// ---------- Variant A: bell + dropdown ----------

export function VariantABell({ s }: { s: ProtoState }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          title="Notifications"
          className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Bell className="size-5" />
          {s.unread > 0 && (
            <CountBadge n={s.unread} className="absolute -right-1 -top-1 min-w-4 px-1 text-[10px] leading-4" />
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={12}
          className="z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-lg"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="text-sm font-semibold">Notifications</div>
            {s.unread > 0 && (
              <button
                onClick={s.markAllRead}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          {s.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <BellOff className="size-8 text-muted-foreground/50" />
              <div className="text-sm font-medium">You're all caught up</div>
              <div className="text-xs text-muted-foreground">
                Notifications about your courses, Refunds and questions show up here.
              </div>
            </div>
          ) : (
            <ul className="max-h-[28rem] divide-y overflow-y-auto">
              {s.items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      s.markRead(n.id);
                      setOpen(false);
                      navigate(n.href);
                    }}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left hover:bg-accent",
                      !n.read && "bg-primary/5"
                    )}
                  >
                    <KindIcon kind={n.kind} className="mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-sm text-muted-foreground", !n.read && "text-foreground")}>
                        <Text parts={n.text} />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{timeAgo(n.minutesAgo)}</div>
                    </div>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ---------- Variant B: inbox page ----------

export function VariantBNavItem({ s }: { s: ProtoState }) {
  return (
    <Link
      to="/notifications"
      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Inbox className="size-4" />
      Notifications
      <CountBadge n={s.unread} className="ml-auto" />
    </Link>
  );
}

export function VariantBInbox({ s }: { s: ProtoState }) {
  const [tab, setTab] = useState<"unread" | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = tab === "unread" ? s.items.filter((n) => !n.read) : s.items;
  const selected = s.items.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <section className="flex w-[26rem] shrink-0 flex-col border-r">
        <header className="flex h-14 items-center justify-between border-b px-5">
          <h1 className="text-lg font-semibold">Notifications</h1>
          <Button variant="ghost" size="sm" disabled={s.unread === 0} onClick={s.markAllRead}>
            <CheckCheck /> Mark all read
          </Button>
        </header>
        <div className="flex gap-1 border-b px-5 py-2">
          {(["all", "unread"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium capitalize",
                tab === t ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              {t}
              {t === "unread" && s.unread > 0 && ` (${s.unread})`}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <Inbox className="size-10 text-muted-foreground/40" />
            <div className="font-medium">{tab === "unread" ? "No unread Notifications" : "No Notifications yet"}</div>
            <div className="max-w-64 text-sm text-muted-foreground">
              When something needs your attention, such as a Refund or a question on a lesson, it lands here.
            </div>
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto">
            {list.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    setSelectedId(n.id);
                    s.markRead(n.id);
                  }}
                  className={cn(
                    "w-full border-b border-l-2 px-5 py-3 text-left hover:bg-accent/50",
                    n.read ? "border-l-transparent" : "border-l-primary",
                    selectedId === n.id && "bg-accent"
                  )}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn("font-medium uppercase tracking-wide", n.read ? "text-muted-foreground" : "text-primary")}>
                      {n.label}
                    </span>
                    <span className="text-muted-foreground">{timeAgo(n.minutesAgo)}</span>
                  </div>
                  <div className={cn("mt-1 line-clamp-2 text-sm", n.read ? "text-muted-foreground" : "text-foreground")}>
                    <Text parts={n.text} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-1 items-start justify-center p-10">
        {selected ? (
          <article className="w-full max-w-xl rounded-lg border bg-card p-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <KindIcon kind={selected.kind} />
              {selected.label} · {timeAgo(selected.minutesAgo)}
            </div>
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
              <Text parts={selected.text} />
            </p>
            <div className="mt-6 flex gap-2">
              <Button asChild>
                <Link to={selected.href}>{selected.action ?? "Open"}</Link>
              </Button>
              <Button variant="outline" onClick={() => s.markUnread(selected.id)}>
                Mark as unread
              </Button>
            </div>
          </article>
        ) : (
          <div className="mt-24 text-sm text-muted-foreground">Select a Notification to read it.</div>
        )}
      </section>
    </div>
  );
}

// ---------- Variant C: action drawer ----------

export function VariantCTrigger({ s, onOpen }: { s: ProtoState; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Bell className="size-4" />
      Notifications
      <CountBadge n={s.unread} className="ml-auto" />
    </button>
  );
}

export function VariantCDrawer({ s, open, onClose }: { s: ProtoState; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  // "Dealt with" = read or dismissed. In this variant, dismissing is the main gesture.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const live = s.items.filter((n) => !dismissed.has(n.id));
  const needs = live.filter((n) => n.action);
  const fyi = live.filter((n) => !n.action);
  const dismiss = (id: string) => {
    s.markRead(id);
    setDismissed((d) => new Set(d).add(id));
  };

  const Card = ({ n }: { n: ProtoNotification }) => (
    <div className={cn("group relative rounded-lg border bg-card p-4", !n.read && "border-primary/40 shadow-sm")}>
      <button
        onClick={() => dismiss(n.id)}
        title="Dismiss"
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
      <div className="flex items-start gap-3">
        <div className={cn("rounded-md p-2", n.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
          <KindIcon kind={n.kind} />
        </div>
        <div className="min-w-0 flex-1 pr-4">
          <div className="text-sm text-muted-foreground">
            <Text parts={n.text} />
          </div>
          <div className="mt-2 flex items-center gap-3">
            {n.action && (
              <Button
                size="xs"
                onClick={() => {
                  s.markRead(n.id);
                  onClose();
                  navigate(n.href);
                }}
              >
                {n.action}
              </Button>
            )}
            {!n.action && (
              <button
                onClick={() => {
                  s.markRead(n.id);
                  onClose();
                  navigate(n.href);
                }}
                className="text-xs font-medium text-primary hover:underline"
              >
                View
              </button>
            )}
            <span className="text-xs text-muted-foreground">{timeAgo(n.minutesAgo)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        onClick={onClose}
        className={cn("fixed inset-0 z-40 bg-black/20 transition-opacity", open ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      <aside
        className={cn(
          "fixed right-0 top-0 z-40 flex h-screen w-[26rem] flex-col border-l bg-background shadow-xl transition-transform",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <header className="flex h-14 items-center justify-between border-b px-5">
          <h2 className="font-semibold">Notifications</h2>
          <div className="flex items-center gap-1">
            {live.length > 0 && (
              <Button variant="ghost" size="xs" onClick={() => live.forEach((n) => dismiss(n.id))}>
                Dismiss all
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X />
            </Button>
          </div>
        </header>
        {live.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <CheckCheck className="size-10 text-muted-foreground/40" />
            <div className="font-medium">Nothing needs you right now</div>
            <div className="text-sm text-muted-foreground">You've dealt with every Notification.</div>
          </div>
        ) : (
          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            {needs.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Needs you · {needs.length}
                </h3>
                {needs.map((n) => (
                  <Card key={n.id} n={n} />
                ))}
              </section>
            )}
            {fyi.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  For your information · {fyi.length}
                </h3>
                {fyi.map((n) => (
                  <Card key={n.id} n={n} />
                ))}
              </section>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

// ---------- floating switcher ----------

export function PrototypeSwitcher({ s }: { s: ProtoState }) {
  const [params, setParams] = useSearchParams();
  const idx = VARIANTS.findIndex((v) => v.key === s.variant);
  const go = (d: number) => {
    const next = VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length].key;
    const p = new URLSearchParams(params);
    p.set("variant", next);
    setParams(p, { replace: true });
  };
  const toggleEmpty = () => {
    const p = new URLSearchParams(params);
    p.set("variant", s.variant);
    p.set("empty", s.empty ? "0" : "1");
    setParams(p, { replace: true });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-zinc-900 px-2 py-1.5 text-sm text-white shadow-xl ring-1 ring-white/10">
      <button onClick={() => go(-1)} className="rounded-full p-1 hover:bg-white/10">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-40 text-center font-medium">
        {s.variant} ({VARIANTS[idx].name})
      </span>
      <button onClick={() => go(1)} className="rounded-full p-1 hover:bg-white/10">
        <ChevronRight className="size-4" />
      </button>
      <span className="mx-1 h-4 w-px bg-white/20" />
      <button onClick={toggleEmpty} className="rounded-full px-2 py-0.5 text-xs hover:bg-white/10">
        {s.empty ? "◉ empty" : "○ empty"}
      </button>
    </div>
  );
}
