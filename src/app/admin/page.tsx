import Link from "next/link";
import { Alert, PageHeader, Stat } from "@/components/ui/display";
import { createClient } from "@/lib/supabase/server";

interface Stats {
  users_total: number;
  users_suspended: number;
  listings_live: number;
  listings_pending: number;
  offers_open: number;
  transactions_active: number;
  transactions_completed_30d: number;
  disputes_open: number;
  reports_open: number;
  verifications_pending: number;
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_marketplace_stats");
  const s = data as unknown as Stats | null;
  return (
    <>
      <PageHeader title="Marketplace overview" description="Live counts from the database." />
      {denied ? <Alert tone="warning" className="mb-4">That area needs full administrator permission.</Alert> : null}
      {error || !s ? (
        <Alert tone="danger">Stats are unavailable right now.</Alert>
      ) : (
        <div className="space-y-6">
          <section aria-label="Queues" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <QueueLink href="/admin/listings" label="Listings awaiting review" value={s.listings_pending} />
            <QueueLink href="/admin/reports" label="Open reports" value={s.reports_open} />
            <QueueLink href="/admin/transactions" label="Open disputes" value={s.disputes_open} />
            <QueueLink href="/admin/verifications" label="Verification requests" value={s.verifications_pending} />
          </section>
          <section aria-label="Activity" className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="Users" value={s.users_total} hint={`${s.users_suspended} suspended`} />
            <Stat label="Live listings" value={s.listings_live} />
            <Stat label="Open offers" value={s.offers_open} />
            <Stat label="Exchanges in progress" value={s.transactions_active} />
            <Stat label="Completed (30 days)" value={s.transactions_completed_30d} />
          </section>
        </div>
      )}
    </>
  );
}

function QueueLink({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link href={href} className="rounded-xl border border-border bg-surface p-4 hover:border-accent">
      <p className="tabular text-2xl font-semibold">{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </Link>
  );
}
