"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/primitives";
import { getBrowserClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markNotificationsReadAction, saveNotificationPreferencesAction } from "@/app/actions/account";
import type { NotificationType } from "@/lib/catalog";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationList({ items, userId }: { items: NotificationItem[]; userId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unread = items.filter((i) => !i.read_at).length;

  // Live: refresh when a new notification arrives for this user.
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`notifications-page:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => router.refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{unread ? `${unread} unread` : "You're all caught up"}</p>
        <Button
          variant="ghost"
          size="sm"
          disabled={!unread}
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await markNotificationsReadAction();
              if (!r.ok) toast.error(r.error);
              router.refresh();
            })
          }
        >
          <CheckCheck aria-hidden="true" /> Mark all as read
        </Button>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {items.map((n) => {
          const content = (
            <div className="flex gap-3 p-4">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm", !n.read_at && "font-semibold")}>
                  {n.title}
                  {!n.read_at ? <span className="sr-only"> (unread)</span> : null}
                </p>
                {n.body ? <p className="truncate text-sm text-muted">{n.body}</p> : null}
                <p className="mt-0.5 text-xs text-muted">{timeAgo(n.created_at)}</p>
              </div>
            </div>
          );
          const markOne = () => {
            if (!n.read_at) void markNotificationsReadAction([n.id]);
          };
          return (
            <li key={n.id}>
              {n.link ? (
                <Link href={n.link} onClick={markOne} className="block hover:bg-surface-2">
                  {content}
                </Link>
              ) : (
                <button type="button" onClick={markOne} className="block w-full text-left hover:bg-surface-2">
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const GROUPS: { label: string; types: NotificationType[] }[] = [
  { label: "Messages", types: ["message"] },
  { label: "New offers", types: ["offer_received"] },
  { label: "Counteroffers & responses", types: ["offer_countered", "offer_accepted", "offer_rejected", "offer_cancelled", "offer_expired"] },
  { label: "Listing moderation", types: ["listing_approved", "listing_rejected"] },
  { label: "Exchanges & disputes", types: ["listing_sold", "listing_swapped", "transaction_update", "dispute_update"] },
  { label: "Reviews", types: ["review_received"] },
  { label: "Verification & reports", types: ["verification_update", "report_update"] },
];

export function NotificationPreferences({
  initial,
  email,
}: {
  initial: Partial<Record<NotificationType, { inApp: boolean; email: boolean }>>;
  email: string | null;
}) {
  const [state, setState] = useState(() =>
    Object.fromEntries(
      GROUPS.map((g) => [g.label, { inApp: initial[g.types[0]!]?.inApp ?? true, email: initial[g.types[0]!]?.email ?? false }]),
    ) as Record<string, { inApp: boolean; email: boolean }>,
  );
  const [pending, startTransition] = useTransition();
  const toggle = (label: string, channel: "inApp" | "email", value: boolean) =>
    setState((s) => ({ ...s, [label]: { ...s[label]!, [channel]: value } }));
  const save = () =>
    startTransition(async () => {
      const prefs = GROUPS.flatMap((g) => g.types.map((type) => ({ type, inApp: state[g.label]?.inApp ?? true, email: state[g.label]?.email ?? false })));
      const r = await saveNotificationPreferencesAction(prefs);
      if (!r.ok) toast.error(r.error);
      else toast.success(r.message ?? "Saved");
    });
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border px-4 py-2 text-xs font-medium text-muted" aria-hidden="true">
          <span>Notify me about</span>
          <span className="w-11 text-center">In app</span>
          <span className="w-11 text-center">Email</span>
        </div>
        <ul className="divide-y divide-border">
          {GROUPS.map((g, i) => (
            <li key={g.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3">
              <span className="text-sm font-medium" id={`pref-label-${i}`}>
                {g.label}
              </span>
              <Switch
                checked={state[g.label]?.inApp}
                onCheckedChange={(v) => toggle(g.label, "inApp", v)}
                aria-label={`${g.label}: in-app notifications`}
              />
              <Switch
                checked={state[g.label]?.email}
                onCheckedChange={(v) => toggle(g.label, "email", v)}
                aria-label={`${g.label}: email notifications`}
              />
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted">
        Emails go to {email ? <span className="font-medium text-foreground">{email}</span> : "your sign-in address"}. SMS and WhatsApp alerts are not available yet.
      </p>
      <Button onClick={save} loading={pending}>
        Save preferences
      </Button>
    </div>
  );
}
