import { Bell } from "lucide-react";
import { Alert, EmptyState, PageHeader } from "@/components/ui/display";
import { NotificationList, NotificationPreferences } from "@/components/account/notification-list";
import type { NotificationType } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";

export default async function NotificationsPage() {
  const viewer = await requireViewer("/dashboard/notifications");
  const supabase = await createClient();
  const [{ data: items, error }, { data: prefs }] = await Promise.all([
    supabase.from("notifications").select("id, title, body, link, read_at, created_at").eq("user_id", viewer.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("notification_preferences").select("type, in_app, email").eq("user_id", viewer.id),
  ]);
  const initial = Object.fromEntries((prefs ?? []).map((p) => [p.type, { inApp: p.in_app, email: p.email }])) as Partial<Record<NotificationType, { inApp: boolean; email: boolean }>>;

  return (
    <>
      <PageHeader title="Notifications" />
      <div className="grid gap-8 xl:grid-cols-[1fr_320px]">
        <section aria-label="Notifications">
          {error ? <Alert tone="danger">We couldn&apos;t load notifications. Refresh to try again.</Alert> : null}
          {!error && !items?.length ? (
            <EmptyState icon={Bell} title="No notifications yet" description="Offers, messages, moderation decisions and exchange updates will show up here." />
          ) : items?.length ? (
            <NotificationList items={items} userId={viewer.id} />
          ) : null}
        </section>
        <section aria-labelledby="prefs-heading">
          <h2 id="prefs-heading" className="mb-3 text-lg font-semibold">
            Preferences
          </h2>
          <NotificationPreferences initial={initial} email={viewer.email} />
        </section>
      </div>
    </>
  );
}
