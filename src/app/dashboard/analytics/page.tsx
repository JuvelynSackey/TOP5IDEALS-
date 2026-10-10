import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { DISPLAY_STATE_LABEL, listingDisplayState } from "@/lib/listing-state";
import { formatCedis } from "@/lib/money";
import { listingPath } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

export default async function AnalyticsPage() {
  await requireViewer("/dashboard/analytics");
  const supabase = await createClient();
  // The RPC is scoped to auth.uid() in the database; no other seller's data can be returned.
  const { data, error } = await supabase.rpc("get_listing_performance", { p_limit: 100 });
  const rows = data ?? [];
  const totals = rows.reduce(
    (acc, r) => ({
      views: acc.views + Number(r.views_total ?? 0),
      views7: acc.views7 + Number(r.views_7d ?? 0),
      saves: acc.saves + Number(r.favorites ?? 0),
      offers: acc.offers + Number(r.offers_total ?? 0),
    }),
    { views: 0, views7: 0, saves: 0, offers: 0 },
  );

  return (
    <>
      <PageHeader title="Listing performance" description="Counts come from real activity on Top5Ideals. Views are deduplicated to one per visitor per listing per day; your own visits are excluded." />
      {error ? <Alert tone="danger">We couldn&apos;t load analytics. Refresh to try again.</Alert> : null}
      {!error && !rows.length ? (
        <EmptyState icon={BarChart3} title="No data yet" description="Analytics appear once you have listings." />
      ) : null}
      {rows.length ? (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Views (all time)", totals.views],
              ["Views (7 days)", totals.views7],
              ["Saves", totals.saves],
              ["Offers received", totals.offers],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="tabular mt-1 text-2xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Performance per listing</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th scope="col" className="p-3 font-medium">Listing</th>
                  <th scope="col" className="p-3 font-medium">Status</th>
                  <th scope="col" className="p-3 text-right font-medium">Views</th>
                  <th scope="col" className="p-3 text-right font-medium">7 days</th>
                  <th scope="col" className="p-3 text-right font-medium">Saves</th>
                  <th scope="col" className="p-3 text-right font-medium">Offers (open)</th>
                  <th scope="col" className="p-3 text-right font-medium">Chats</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {rows.map((r) => {
                  const state = listingDisplayState(r.status!, r.moderation_status!);
                  return (
                    <tr key={r.listing_id} className="border-b border-border last:border-0">
                      <td className="max-w-64 p-3">
                        {["live", "paused", "reserved", "sold", "swapped"].includes(state) && r.slug && r.slug_key ? (
                          <Link href={listingPath(r.slug, r.slug_key)} className="block truncate font-medium hover:underline">
                            {r.title}
                          </Link>
                        ) : (
                          <span className="block truncate font-medium">{r.title || "Untitled draft"}</span>
                        )}
                        <span className="text-xs text-muted">{formatCedis(r.price_minor)}</span>
                      </td>
                      <td className="p-3">
                        <Badge>{DISPLAY_STATE_LABEL[state]}</Badge>
                      </td>
                      <td className="p-3 text-right">{Number(r.views_total)}</td>
                      <td className="p-3 text-right">{Number(r.views_7d)}</td>
                      <td className="p-3 text-right">{Number(r.favorites)}</td>
                      <td className="p-3 text-right">
                        {Number(r.offers_total)} ({Number(r.offers_open)})
                      </td>
                      <td className="p-3 text-right">{Number(r.conversations)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
