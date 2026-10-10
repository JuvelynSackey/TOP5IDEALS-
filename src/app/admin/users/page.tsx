import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-controls";
import { Pagination } from "@/components/ui/pagination";
import { AccountStatusButton } from "@/components/admin/admin-buttons";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { Users } from "lucide-react";

const PER_PAGE = 25;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const params = await searchParams;
  const viewer = await getViewer();
  const page = Math.max(1, Number(params.page) || 1);
  const status = params.status === "suspended" || params.status === "active" ? params.status : undefined;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_query: params.q?.slice(0, 80) ?? "",
    p_status: status,
    p_limit: PER_PAGE,
    p_offset: (page - 1) * PER_PAGE,
  });
  const total = Number(data?.[0]?.total_count ?? 0);

  return (
    <>
      <PageHeader title="Users" description={viewer?.isAdmin ? "Search by name, username or email." : "Moderators see names and usernames only. Email addresses are restricted to administrators."} />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
        <label htmlFor="user-q" className="sr-only">
          Search users
        </label>
        <Input id="user-q" name="q" type="search" defaultValue={params.q} placeholder="Search…" className="sm:max-w-xs" />
        <Select name="status" defaultValue={status ?? ""} className="sm:w-44" aria-label="Account status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </Select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      {error ? <Alert tone="danger">Could not load users.</Alert> : null}
      {!error && !data?.length ? <EmptyState icon={Users} title="No users found" /> : null}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">Users</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="p-3 font-medium">User</th>
              <th scope="col" className="p-3 font-medium">Type / role</th>
              <th scope="col" className="p-3 font-medium">Status</th>
              <th scope="col" className="p-3 font-medium">Listings</th>
              <th scope="col" className="p-3 font-medium">Joined</th>
              <th scope="col" className="p-3 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <p className="font-medium">{u.full_name || "—"}</p>
                  <p className="text-xs text-muted">
                    {u.username ? `@${u.username}` : "no username"}
                    {u.email ? ` · ${u.email}` : ""}
                  </p>
                </td>
                <td className="p-3">
                  {u.account_type} · {u.role}
                  {u.verification_status === "verified" ? <Badge tone="accent" className="ml-1">verified</Badge> : null}
                </td>
                <td className="p-3">
                  <Badge tone={u.account_status === "active" ? "success" : "danger"}>{u.account_status}</Badge>
                </td>
                <td className="tabular p-3">{Number(u.listing_count)}</td>
                <td className="p-3">{formatDate(u.created_at)}</td>
                <td className="p-3 text-right">
                  {viewer?.isAdmin && u.role !== "admin" && u.id !== viewer.id && u.id && u.account_status ? <AccountStatusButton userId={u.id} status={u.account_status} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PER_PAGE))} basePath="/admin/users" params={{ q: params.q, status }} />
    </>
  );
}
