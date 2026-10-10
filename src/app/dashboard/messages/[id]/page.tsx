import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/display";
import { ChatThread } from "@/components/messages/chat-thread";
import { listingImageUrl } from "@/lib/storage";
import { listingPath } from "@/lib/slug";
import { formatCedis } from "@/lib/money";
import { offerStatusLabel } from "@/lib/offers";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer("/dashboard/messages");
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, listing_id, conversation_members(user_id, profiles(id, username, full_name))")
    .eq("id", id.data)
    .maybeSingle();
  if (!conversation) notFound();

  const other = conversation.conversation_members.find((m) => m.user_id !== viewer.id)?.profiles ?? null;
  const otherName = other?.full_name || (other?.username ? `@${other.username}` : "Member");

  const [{ data: messages }, { data: listing }, { data: offers }, { data: block }] = await Promise.all([
    supabase.from("messages").select("id, conversation_id, sender_id, body, client_id, created_at").eq("conversation_id", conversation.id).order("created_at", { ascending: false }).limit(100),
    conversation.listing_id
      ? supabase.from("listings").select("id, title, slug, slug_key, price_minor, status, listing_images(storage_path, is_primary)").eq("id", conversation.listing_id).maybeSingle()
      : Promise.resolve({ data: null }),
    conversation.listing_id
      ? supabase
          .from("swap_offers")
          .select("id, status, offer_type, current_version, expires_at")
          .eq("listing_id", conversation.listing_id)
          .or(`initiator_id.eq.${viewer.id},recipient_id.eq.${viewer.id}`)
          .in("status", ["pending", "accepted", "disputed"])
          .order("updated_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
    other ? supabase.from("user_blocks").select("blocked_id").eq("blocker_id", viewer.id).eq("blocked_id", other.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const cover = listing?.listing_images.find((i) => i.is_primary)?.storage_path;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/messages" className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Back to messages">
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="truncate text-lg font-semibold">{otherName}</h1>
      </div>
      {listing ? (
        <Link href={listingPath(listing.slug, listing.slug_key)} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 hover:border-border-strong">
          <span className="relative size-11 shrink-0 overflow-hidden rounded-md bg-surface-2">
            {cover ? <Image src={listingImageUrl(cover)!} alt="" fill sizes="44px" className="object-cover" /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{listing.title}</span>
            <span className="tabular block text-xs text-muted">{formatCedis(listing.price_minor)}</span>
          </span>
        </Link>
      ) : null}
      {offers?.length ? (
        <ul className="flex flex-wrap gap-2">
          {offers.map((o) => (
            <li key={o.id}>
              <Link href={`/dashboard/offers/${o.id}`} className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-1.5 text-sm">
                <Repeat className="size-4 text-accent" aria-hidden="true" />
                {o.offer_type === "swap" ? "Swap offer" : "Purchase offer"}
                <Badge tone="accent">{offerStatusLabel(o.status, o.current_version, o.status === "pending" && new Date(o.expires_at) < new Date())}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <ChatThread
        conversationId={conversation.id}
        viewerId={viewer.id}
        otherUserId={other?.id ?? null}
        otherName={otherName}
        initialMessages={(messages ?? []).reverse()}
        initiallyBlocked={Boolean(block)}
      />
    </div>
  );
}
