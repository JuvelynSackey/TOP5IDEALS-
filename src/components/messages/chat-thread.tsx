"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Ban, Flag, Loader2, MoreVertical, Send, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ReportDialog } from "@/components/listings/listing-actions";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { markConversationReadAction, sendMessageAction, type SentMessage } from "@/app/actions/messages";
import { blockUserAction } from "@/app/actions/marketplace";

interface UiMessage extends SentMessage {
  state: "sent" | "sending" | "failed";
}

export function ChatThread({
  conversationId,
  viewerId,
  otherUserId,
  otherName,
  initialMessages,
  initiallyBlocked,
}: {
  conversationId: string;
  viewerId: string;
  otherUserId: string | null;
  otherName: string;
  initialMessages: SentMessage[];
  initiallyBlocked: boolean;
}) {
  const [messages, setMessages] = useState<UiMessage[]>(() => initialMessages.map((m) => ({ ...m, state: "sent" })));
  const [draft, setDraft] = useState("");
  const [online, setOnline] = useState(true);
  const [live, setLive] = useState<"connecting" | "live" | "offline">("connecting");
  const [blocked, setBlocked] = useState(initiallyBlocked);
  const [reportTarget, setReportTarget] = useState<{ type: "message" | "user"; id: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const upsert = useCallback((incoming: SentMessage, state: UiMessage["state"] = "sent") => {
    setMessages((prev) => {
      // Deduplicate by client_id so Realtime echoes and retries never double up.
      const index = prev.findIndex((m) => m.client_id === incoming.client_id || m.id === incoming.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = { ...incoming, state };
        return next;
      }
      return [...prev, { ...incoming, state }].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    void markConversationReadAction(conversationId);
  }, [conversationId, messages.length]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        upsert(payload.new as SentMessage);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLive("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("offline");
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, upsert]);

  // After reconnecting, fetch anything missed while offline.
  useEffect(() => {
    if (!online || live !== "live") return;
    const supabase = getBrowserClient();
    const latest = messages.filter((m) => m.state === "sent").at(-1)?.created_at;
    let query = supabase.from("messages").select("id, conversation_id, sender_id, body, client_id, created_at").eq("conversation_id", conversationId).order("created_at").limit(100);
    if (latest) query = query.gt("created_at", latest);
    void query.then(({ data }) => data?.forEach((m) => upsert(m)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on reconnect
  }, [online, live, conversationId, upsert]);

  async function deliver(message: UiMessage) {
    upsert(message, "sending");
    const result = await sendMessageAction({ conversationId, body: message.body, clientId: message.client_id });
    if (result.ok) upsert(result.data, "sent");
    else {
      upsert(message, "failed");
      if (result.code === "blocked") setBlocked(true);
      toast.error(result.error);
    }
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    const optimistic: UiMessage = {
      id: crypto.randomUUID(),
      client_id: crypto.randomUUID(),
      conversation_id: conversationId,
      sender_id: viewerId,
      body,
      created_at: new Date().toISOString(),
      state: "sending",
    };
    setDraft("");
    void deliver(optimistic);
  }

  async function toggleBlock() {
    if (!otherUserId) return;
    const r = await blockUserAction(otherUserId, !blocked);
    if (!r.ok) toast.error(r.error);
    else {
      setBlocked(!blocked);
      toast.success(r.message ?? "Updated");
    }
  }

  const dayLabels = messages.map((m) => formatDate(m.created_at));
  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[420px] flex-col overflow-hidden rounded-xl border border-border bg-surface lg:h-[calc(100dvh-12rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p className="flex items-center gap-2 text-xs text-muted" role="status">
          {!online ? (
            <>
              <WifiOff className="size-3.5 text-warning" aria-hidden="true" /> You&apos;re offline — messages will fail until you reconnect
            </>
          ) : live === "live" ? (
            <>
              <span className="size-2 rounded-full bg-success" aria-hidden="true" /> Live
            </>
          ) : live === "connecting" ? (
            "Connecting…"
          ) : (
            "Live updates paused — refresh to see new messages"
          )}
        </p>
        {otherUserId ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Conversation options">
                <MoreVertical aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setReportTarget({ type: "user", id: otherUserId })}>
                <Flag aria-hidden="true" /> Report {otherName}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void toggleBlock()}>
                <Ban aria-hidden="true" /> {blocked ? "Unblock" : "Block"} {otherName}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite" aria-label="Messages">
        {!messages.length ? <p className="py-10 text-center text-sm text-muted">Say hello and ask about the phone. Never share codes or send money in advance.</p> : null}
        {messages.map((m, i) => {
          const mine = m.sender_id === viewerId;
          const day = dayLabels[i]!;
          const showDay = i === 0 || day !== dayLabels[i - 1];
          return (
            <div key={m.client_id}>
              {showDay ? <p className="my-3 text-center text-xs text-muted">{day}</p> : null}
              <div className={cn("group flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm", mine ? "rounded-br-sm bg-accent text-accent-foreground" : "rounded-bl-sm bg-surface-2")}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={cn("mt-1 flex items-center justify-end gap-1 text-[11px]", mine ? "text-accent-foreground/70" : "text-muted")}>
                    {m.state === "sending" ? <Loader2 className="size-3 animate-spin" aria-label="Sending" /> : null}
                    {m.state === "failed" ? (
                      <button type="button" onClick={() => void deliver(m)} className="inline-flex items-center gap-1 font-medium underline">
                        <AlertCircle className="size-3" aria-hidden="true" /> Not sent — retry
                      </button>
                    ) : (
                      formatTime(m.created_at)
                    )}
                  </p>
                </div>
                {!mine && m.state === "sent" ? (
                  <button
                    type="button"
                    onClick={() => setReportTarget({ type: "message", id: m.id })}
                    className="ml-1 self-center rounded p-1 text-muted opacity-0 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    aria-label="Report this message"
                  >
                    <Flag className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {blocked ? (
        <p className="border-t border-border px-4 py-3 text-center text-sm text-muted">You can&apos;t message each other because one of you has blocked the other.</p>
      ) : (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-border p-3">
          <label htmlFor="message-input" className="sr-only">
            Message
          </label>
          <textarea
            id="message-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Write a message…"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-lg border border-border-strong bg-background px-3 py-2.5 text-base focus-visible:outline-2 focus-visible:outline-ring sm:text-sm"
          />
          <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send message">
            <Send aria-hidden="true" />
          </Button>
        </form>
      )}
      {reportTarget ? (
        <ReportDialog targetType={reportTarget.type} targetId={reportTarget.id} open onOpenChange={(o) => !o && setReportTarget(null)} />
      ) : null}
    </div>
  );
}
