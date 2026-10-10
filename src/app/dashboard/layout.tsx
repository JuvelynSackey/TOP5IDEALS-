import type { Metadata } from "next";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { requireViewer } from "@/server/auth";
import { Alert } from "@/components/ui/display";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("/dashboard");
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {!viewer.isActive ? (
        <Alert tone="danger" className="mb-6" title="Your account is suspended">
          You can view your history, but you can&apos;t list phones, message or make offers. Contact support if you believe this is a mistake.
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <DashboardNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
