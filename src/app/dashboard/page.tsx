import Link from "next/link";
import { ArrowRight, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardHeader, CardTitle, PageHeader, Stat } from "@/components/ui/display";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { logger } from "@/lib/logger";

interface DashboardStats {
  listings_live: number;
  listings_pending: number;
  listings_rejected: number;
  listings_draft: number;
  listings_paused: number;
  listings_reserved: number;
  views_30d: number;
  views_total: number;
  favorites_total: number;
  unread_messages: number;
  offers_awaiting_me: number;
  active_transactions: number;
  completed_sales: number;
  completed_swaps: number;
  trust: { review_count: number; average_overall: number | null } | null;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const viewer = await requireViewer();
  const { denied } = await searchParams;
  const supabase = await createClient();
  // Expire overdue offers opportunistically so counts are accurate.
  await supabase.rpc("expire_due_offers");
  const { data, error } = await supabase.rpc("get_seller_dashboard");
  if (error) logger.error("dashboard.stats_failed", { code: error.code });
  const s = (data ?? null) as unknown as DashboardStats | null;
  const name = viewer.profile.full_name.split(" ")[0] || viewer.profile.username || "there";

  return (
    <>
      <PageHeader
        title={`Hi, ${name}`}
        description="Your listings, offers and exchanges at a glance."
        actions={
          <Button asChild>
            <Link href="/sell">
              <Plus aria-hidden="true" /> List a phone
            </Link>
          </Button>
        }
      />
      {denied ? <Alert tone="warning" className="mb-4">You don&apos;t have access to that area.</Alert> : null}
      {!viewer.profileComplete ? (
        <Alert
          tone="info"
          className="mb-6"
          title="Finish setting up your profile"
          action={
            <Button asChild size="sm">
              <Link href="/dashboard/profile?setup=1">Complete profile</Link>
            </Button>
          }
        >
          Add a username and your location to list phones, message sellers and make offers.
        </Alert>
      ) : null}
      {error || !s ? (
        <Alert tone="danger">We couldn&apos;t load your stats right now. Refresh to try again.</Alert>
      ) : (
        <div className="space-y-6">
          <section aria-label="Needs your attention" className="grid gap-3 sm:grid-cols-3">
            <ActionCard href="/dashboard/offers?tab=awaiting" count={s.offers_awaiting_me} label="Offers waiting for your reply" />
            <ActionCard href="/dashboard/messages" count={s.unread_messages} label="Unread messages" />
            <ActionCard href="/dashboard/transactions" count={s.active_transactions} label="Exchanges in progress" />
          </section>
          <section aria-label="Listings" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Live listings" value={s.listings_live} />
            <Stat label="Awaiting review" value={s.listings_pending} hint={s.listings_rejected ? `${s.listings_rejected} need changes` : undefined} />
            <Stat label="Drafts" value={s.listings_draft} />
            <Stat label="Paused / reserved" value={s.listings_paused + s.listings_reserved} />
          </section>
          <section aria-label="Performance" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Views (30 days)" value={s.views_30d} hint="Unique viewers per day" />
            <Stat label="Saves" value={s.favorites_total} />
            <Stat label="Completed sales" value={s.completed_sales} />
            <Stat label="Completed swaps" value={s.completed_swaps} />
          </section>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Your reputation</CardTitle>
              <Link href="/dashboard/reviews" className="text-sm text-accent hover:underline">
                See reviews
              </Link>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              {s.trust && Number(s.trust.review_count) > 0 ? (
                <>
                  <Star className="size-6 fill-current text-warning" aria-hidden="true" />
                  <p className="tabular text-2xl font-semibold">{Number(s.trust.average_overall).toFixed(1)}</p>
                  <p className="text-sm text-muted">from {s.trust.review_count} review{Number(s.trust.review_count) === 1 ? "" : "s"}</p>
                </>
              ) : (
                <p className="text-sm text-muted">No reviews yet. Reviews appear after both parties confirm a completed exchange.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function ActionCard({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <Link href={href} className="group flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent">
      <div>
        <p className="tabular text-2xl font-semibold">{count}</p>
        <p className="text-sm text-muted">{label}</p>
      </div>
      <ArrowRight className="size-4 text-muted group-hover:text-accent" aria-hidden="true" />
    </Link>
  );
}
