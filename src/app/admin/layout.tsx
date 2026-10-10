import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireStaff } from "@/server/auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireStaff();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted">
        Administration · signed in as {viewer.profile.role}
      </p>
      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <AdminNav isAdmin={viewer.isAdmin} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
