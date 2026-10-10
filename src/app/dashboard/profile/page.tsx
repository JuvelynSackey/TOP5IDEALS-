import Link from "next/link";
import { Alert, Card, CardContent, PageHeader } from "@/components/ui/display";
import { ProfileForm } from "@/components/account/profile-form";
import { safeNextPath } from "@/lib/validation/auth";
import { createClient } from "@/lib/supabase/server";
import { requireViewer } from "@/server/auth";
import { getCatalogue } from "@/server/queries";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ setup?: string; next?: string }> }) {
  const viewer = await requireViewer("/dashboard/profile");
  const params = await searchParams;
  const supabase = await createClient();
  const [{ regions }, { data: contact }] = await Promise.all([
    getCatalogue(),
    supabase.from("profile_contacts").select("phone_e164").eq("user_id", viewer.id).maybeSingle(),
  ]);
  const setup = params.setup === "1" || !viewer.profileComplete;
  const next = params.next ? safeNextPath(params.next, "/dashboard") : setup ? "/dashboard" : undefined;

  return (
    <>
      <PageHeader
        title={setup ? "Set up your profile" : "Profile & settings"}
        description={setup ? "A username and your location are needed before you can list phones, message or make offers." : "Your public profile and private contact details."}
      />
      {setup ? (
        <Alert tone="info" className="mb-4">
          Buyers and sellers see your name, username, city and reviews. Your email and phone number stay private.
        </Alert>
      ) : null}
      <Card>
        <CardContent>
          <ProfileForm
            userId={viewer.id}
            email={viewer.email}
            avatarPath={viewer.profile.avatar_path}
            regions={regions.map((r) => ({ id: r.id, name: r.name }))}
            next={next}
            defaults={{
              username: viewer.profile.username ?? "",
              fullName: viewer.profile.full_name,
              regionId: viewer.profile.region_id ?? ("" as unknown as number),
              city: viewer.profile.city ?? "",
              bio: viewer.profile.bio ?? "",
              phone: contact?.phone_e164 ?? "",
            }}
          />
        </CardContent>
      </Card>
      <p className="mt-6 text-sm text-muted">
        Need a new password?{" "}
        <Link href="/auth/forgot-password" className="text-accent hover:underline">
          Send a reset link
        </Link>
        . Manage notifications in{" "}
        <Link href="/dashboard/notifications" className="text-accent hover:underline">
          notification settings
        </Link>
        .
      </p>
    </>
  );
}
