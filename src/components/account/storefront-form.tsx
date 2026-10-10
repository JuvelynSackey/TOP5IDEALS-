"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { ImageUploadButton } from "./image-upload-button";
import { businessProfileSchema, type BusinessProfileInput } from "@/lib/validation/auth";
import { logoUrl } from "@/lib/storage";
import { slugify } from "@/lib/slug";
import { saveBusinessProfileAction } from "@/app/actions/account";

export function StorefrontForm({
  userId,
  defaults,
  logoPath,
  regions,
  exists,
}: {
  userId: string;
  defaults: BusinessProfileInput;
  logoPath: string | null;
  regions: { id: number; name: string }[];
  exists: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(logoPath);
  const [logoChanged, setLogoChanged] = useState(false);
  const form = useForm<BusinessProfileInput, unknown, z.output<typeof businessProfileSchema>>({ resolver: zodResolver(businessProfileSchema), defaultValues: defaults });
  const { errors } = form.formState;
  const slug = form.watch("slug");

  // The server re-validates the raw input with the same schema.
  const onSubmit = form.handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const r = await saveBusinessProfileAction(form.getValues(), logoChanged ? logo : undefined);
      if (!r.ok) {
        for (const [key, msgs] of Object.entries(r.fieldErrors ?? {})) form.setError(key as keyof BusinessProfileInput, { message: msgs[0] });
        setFormError(r.error);
        return;
      }
      setLogoChanged(false);
      toast.success(r.message ?? "Saved");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <div className="flex items-center gap-4">
        <Avatar src={logoUrl(logo)} name={form.watch("businessName") || "Shop"} size={64} className="rounded-xl" />
        <ImageUploadButton
          bucket="business-logos"
          userId={userId}
          label={logo ? "Change logo" : "Upload logo"}
          onUploaded={(path) => {
            setLogo(path);
            setLogoChanged(true);
            toast.info("Logo uploaded — save to apply it.");
          }}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="businessName" label="Business name" required error={errors.businessName?.message}>
          <Input
            {...form.register("businessName", {
              onBlur: (e) => {
                if (!form.getValues("slug")) form.setValue("slug", slugify(e.target.value));
              },
            })}
          />
        </Field>
        <Field id="slug" label="Storefront address" required hint={slug ? `top5ideals.com/shop/${slug}` : "Lowercase letters, numbers and hyphens."} error={errors.slug?.message}>
          <Input autoCapitalize="none" {...form.register("slug")} />
        </Field>
        <Field id="regionId" label="Region" required error={errors.regionId?.message}>
          <Select {...form.register("regionId")}>
            <option value="">Choose region…</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="city" label="City or town" required error={errors.city?.message}>
          <Input {...form.register("city")} />
        </Field>
        <Field id="area" label="Area / shop location" hint="e.g. Circle, Kwame Nkrumah Ave." error={errors.area?.message}>
          <Input {...form.register("area")} />
        </Field>
        <Field id="publicPhone" label="Public business phone (optional)" hint="Shown on your storefront. Leave empty to keep contact in-app." error={errors.publicPhone?.message}>
          <Input type="tel" inputMode="tel" {...form.register("publicPhone")} />
        </Field>
      </div>
      <Field id="description" label="About your business" error={errors.description?.message}>
        <Textarea rows={4} maxLength={2000} {...form.register("description")} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending}>
          {exists ? "Save storefront" : "Create storefront"}
        </Button>
        {exists && slug ? (
          <Link href={`/shop/${slug}`} className="text-sm text-accent hover:underline">
            View storefront
          </Link>
        ) : null}
      </div>
    </form>
  );
}
