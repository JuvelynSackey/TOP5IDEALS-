import Image from "next/image";
import Link from "next/link";
import { MessageCircle, Smartphone } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Alert, EmptyState, PageHeader } from "@/components/ui/display";
import { avatarUrl, listingImageUrl } from "@/lib/storage";
import { timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { cn } from "@/lib/utils";

export default async function MessagesPage() {
  const viewer = await requireViewer("/dashboard/messages");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_conversations", { p_limit: 100 });

  return (
    <>
      <PageHeader title="Messages" description="Private conversations with buyers and sellers. Keep deal details here so there's a record if anything goes wrong." />
      {error ? <Alert tone="danger">We couldn&apos;t load your messages. Refresh to try again.</Alert> : null}
      {!error && !data?.length ? (
        <EmptyState icon={MessageCircle} title="No conversations yet" description="Use “Message” on any listing to ask the seller a question." />
      ) : null}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {(data ?? []).map((c) => {
          const unread = Number(c.unread_count ?? 0);
          const image = listingImageUrl(c.listing_image_path);
          return (
            <li key={c.id}>
              <Link href={`/dashboard/messages/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-surface-2 sm:p-4">
                <Avatar src={avatarUrl(c.other_avatar_path)} name={c.other_full_name || c.other_username} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{c.other_full_name || (c.other_username ? `@${c.other_username}` : "Member")}</p>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(c.last_message_at)}</span>
                  </div>
                  {c.listing_title ? <p className="truncate text-xs text-muted">Re: {c.listing_title}</p> : null}
                  <p className={cn("truncate text-sm", unread ? "text-foreground" : "text-muted")}>
                    {c.last_message_body ? `${c.last_message_sender_id === viewer.id ? "You: " : ""}${c.last_message_body}` : "No messages yet"}
                  </p>
                </div>
                {image ? (
                  <span className="relative hidden size-11 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:block">
                    <Image src={image} alt="" fill sizes="44px" className="object-cover" />
                  </span>
                ) : c.listing_id ? (
                  <Smartphone className="hidden size-5 text-muted sm:block" aria-hidden="true" />
                ) : null}
                {unread ? (
                  <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground">
                    {unread}
                    <span className="sr-only"> unread</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
