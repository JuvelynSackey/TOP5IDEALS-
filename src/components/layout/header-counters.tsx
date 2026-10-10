"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bell, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/client";

/**
 * Unread message / notification badges. Starts from server-rendered counts,
 * then refreshes on navigation and on Realtime events. Realtime rows are
 * filtered by RLS, so a user only ever receives their own events.
 */
export function HeaderCounters({
  viewerId,
  initialNotifications,
  initialMessages,
}: {
  viewerId: string;
  initialNotifications: number;
  initialMessages: number;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [messages, setMessages] = useState(initialMessages);
  const pathname = usePathname();

  const refresh = useCallback(() => {
    fetchCounts(viewerId).then(({ notifications: n, messages: m }) => {
      if (n !== null) setNotifications(n);
      if (m !== null) setMessages(m);
    });
  }, [viewerId]);

  useEffect(() => {
    let active = true;
    fetchCounts(viewerId).then(({ notifications: n, messages: m }) => {
      if (!active) return;
      if (n !== null) setNotifications(n);
      if (m !== null) setMessages(m);
    });
    return () => {
      active = false;
    };
  }, [pathname, viewerId]);

  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`header-counts:${viewerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${viewerId}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        if ((payload.new as { sender_id?: string }).sender_id !== viewerId) refresh();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [viewerId, refresh]);

  return (
    <>
      <Button asChild variant="ghost" size="icon-sm" className="relative">
        <Link href="/dashboard/messages" aria-label={`Messages${messages ? `, ${messages} unread` : ""}`}>
          <MessageCircle aria-hidden="true" />
          {messages > 0 ? <CountDot value={messages} /> : null}
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon-sm" className="relative">
        <Link href="/dashboard/notifications" aria-label={`Notifications${notifications ? `, ${notifications} unread` : ""}`}>
          <Bell aria-hidden="true" />
          {notifications > 0 ? <CountDot value={notifications} /> : null}
        </Link>
      </Button>
    </>
  );
}

async function fetchCounts(viewerId: string): Promise<{ notifications: number | null; messages: number | null }> {
  const supabase = getBrowserClient();
  const [n, m] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", viewerId).is("read_at", null),
    supabase.rpc("unread_message_count"),
  ]);
  return {
    notifications: !n.error && n.count !== null ? n.count : null,
    messages: !m.error && typeof m.data === "number" ? m.data : null,
  };
}

function CountDot({ value }: { value: number }) {
  return (
    <span
      className="tabular absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground"
      aria-hidden="true"
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}
