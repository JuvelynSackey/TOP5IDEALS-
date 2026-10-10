import { Alert, PageHeader } from "@/components/ui/display";
import { SettingRow } from "@/components/admin/admin-forms";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/server/auth";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").select("key, value, description").order("key");
  return (
    <>
      <PageHeader title="Settings" description="Changes take effect immediately for new actions. Every change is restricted to administrators by the database." />
      {error ? <Alert tone="danger">Could not load settings.</Alert> : null}
      <div className="space-y-3">
        {(data ?? []).map((s) => (
          <SettingRow key={s.key} settingKey={s.key} description={s.description} value={typeof s.value === "boolean" ? s.value : Number(s.value)} />
        ))}
      </div>
    </>
  );
}
