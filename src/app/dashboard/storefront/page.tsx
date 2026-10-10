import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { Alert, Badge, Card, CardContent, PageHeader } from "@/components/ui/display";
import { StorefrontForm } from "@/components/account/storefront-form";
import { createClient } from "@/lib/supabase/server";
import { requireCompleteProfile } from "@/server/auth";
import { getCatalogue } from "@/server/queries";

export default async function StorefrontPage() {
  const viewer = await requireCompleteProfile("/dashboard/storefront");
  const supabase = await createClient();
  const [{ regions }, { data: business }] = await Promise.all([
    getCatalogue(),
    supabase.from("business_profiles").select("*").eq("owner_id", viewer.id).maybeSingle(),
  ]);

  return (
    <>
      <PageHeader
        title="Storefront"
        description="A public page for your phone business with all your live listings."
        actions={business ? <Badge tone={business.verification_status === "verified" ? "success" : "neutral"}>{business.verification_status === "verified" ? "Verified business" : `Verification: ${business.verification_status}`}</Badge> : undefined}
      />
      {!business ? (
        <Alert tone="info" className="mb-4">
          Creating a storefront switches your account to a business account. It does <strong>not</strong> make you verified — that requires submitting documents for review.
        </Alert>
      ) : business.verification_status !== "verified" ? (
        <Alert
          tone="info"
          className="mb-4"
          action={
            <Link href="/dashboard/verification" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
              <BadgeCheck className="size-4" aria-hidden="true" /> Get verified
            </Link>
          }
        >
          Verified shops get a badge and appear under Trusted sellers.
        </Alert>
      ) : null}
      <Card>
        <CardContent>
          <StorefrontForm
            userId={viewer.id}
            exists={Boolean(business)}
            logoPath={business?.logo_path ?? null}
            regions={regions.map((r) => ({ id: r.id, name: r.name }))}
            defaults={{
              businessName: business?.business_name ?? "",
              slug: business?.slug ?? "",
              description: business?.description ?? "",
              regionId: business?.region_id ?? viewer.profile.region_id ?? ("" as unknown as number),
              city: business?.city ?? viewer.profile.city ?? "",
              area: business?.area ?? "",
              publicPhone: business?.public_phone ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
