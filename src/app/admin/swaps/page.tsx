import { Alert, Badge, PageHeader } from "@/components/ui/display";
import { formatCedis } from "@/lib/money";
import { formatDateTime } from "@/lib/format";
import { OFFER_STATUS_LABEL } from "@/lib/offers";
import { createClient } from "@/lib/supabase/server";

export default async function AdminSwapsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("swap_offers")
    .select("id, offer_type, status, current_version, created_at, updated_at, expires_at, listing:listings!swap_offers_listing_id_fkey(title), initiator:profiles!swap_offers_initiator_id_fkey(username), recipient:profiles!swap_offers_recipient_id_fkey(username), swap_offer_events(version, event_type, cash_amount_minor, cash_payer)")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (status && ["pending", "accepted", "rejected", "cancelled", "expired", "completed", "disputed"].includes(status)) {
    query = query.eq("status", status as "pending");
  }
  const { data, error } = await query;

  return (
    <>
      <PageHeader title="Swap & offer monitor" description="Read-only view of recent negotiations for spotting abuse patterns (e.g. many rapid offers, repeated cancellations)." />
      <form className="mb-4 flex gap-2">
        <label htmlFor="status" className="sr-only">
          Status
        </label>
        <select id="status" name="status" defaultValue={status ?? ""} className="h-10 rounded-lg border border-border-strong bg-surface px-3 text-sm">
          <option value="">All statuses</option>
          {Object.entries(OFFER_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-lg border border-border-strong px-3 text-sm font-medium hover:bg-surface-2">
          Filter
        </button>
      </form>
      {error ? <Alert tone="danger">Could not load offers.</Alert> : null}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">Recent offers</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="p-3 font-medium">Listing</th>
              <th scope="col" className="p-3 font-medium">Parties</th>
              <th scope="col" className="p-3 font-medium">Type</th>
              <th scope="col" className="p-3 font-medium">Latest cash</th>
              <th scope="col" className="p-3 font-medium">Versions</th>
              <th scope="col" className="p-3 font-medium">Status</th>
              <th scope="col" className="p-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((o) => {
              const latest = o.swap_offer_events.filter((e) => e.version === o.current_version && (e.event_type === "created" || e.event_type === "countered")).at(-1);
              return (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="max-w-48 truncate p-3">{o.listing?.title}</td>
                  <td className="p-3">
                    @{o.initiator?.username ?? "deleted"} → @{o.recipient?.username ?? "deleted"}
                  </td>
                  <td className="p-3">{o.offer_type}</td>
                  <td className="tabular p-3">{latest ? `${formatCedis(Number(latest.cash_amount_minor))} (${latest.cash_payer})` : "—"}</td>
                  <td className="tabular p-3">{o.current_version}</td>
                  <td className="p-3">
                    <Badge>{OFFER_STATUS_LABEL[o.status]}</Badge>
                  </td>
                  <td className="p-3 text-xs text-muted">{formatDateTime(o.updated_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
