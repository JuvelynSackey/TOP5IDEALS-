"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Alert } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form-controls";
import { ImageUploadButton } from "./image-upload-button";
import { profileSchema, type ProfileInput } from "@/lib/validation/auth";
import { avatarUrl } from "@/lib/storage";
import { setAvatarAction, updateProfileAction } from "@/app/actions/account";

export function ProfileForm({
  userId,
  email,
  defaults,
  avatarPath,
  regions,
  next,
}: {
  userId: string;
  email: string | null;
  defaults: ProfileInput;
  avatarPath: string | null;
  regions: { id: number; name: string }[];
  next?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [avatar, setAvatar] = useState(avatarPath);
  const form = useForm<ProfileInput, unknown, z.output<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: defaults });
  const { errors } = form.formState;

  // The server re-validates the raw input with the same schema.
  const onSubmit = form.handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const r = await updateProfileAction(form.getValues());
      if (!r.ok) {
        for (const [key, msgs] of Object.entries(r.fieldErrors ?? {})) form.setError(key as keyof ProfileInput, { message: msgs[0] });
        setFormError(r.error);
        return;
      }
      toast.success(r.message ?? "Saved");
      if (next) router.push(next);
      else router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <div className="flex items-center gap-4">
        <Avatar src={avatarUrl(avatar)} name={defaults.fullName || "?"} size={64} />
        <div className="space-y-1">
          <ImageUploadButton
            bucket="avatars"
            userId={userId}
            label={avatar ? "Change photo" : "Add photo"}
            onUploaded={async (path) => {
              const r = await setAvatarAction(path);
              if (!r.ok) toast.error(r.error);
              else {
                setAvatar(path);
                toast.success("Photo updated");
                router.refresh();
              }
            }}
          />
          <p className="text-xs text-muted">Optional. A clear photo builds trust.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="fullName" label="Full name" required error={errors.fullName?.message}>
          <Input autoComplete="name" {...form.register("fullName")} />
        </Field>
        <Field id="username" label="Username" required hint="Public. Lowercase letters, numbers, underscores." error={errors.username?.message}>
          <Input autoComplete="username" autoCapitalize="none" {...form.register("username")} />
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
          <Input autoComplete="address-level2" {...form.register("city")} />
        </Field>
      </div>
      <Field id="bio" label="About you" hint="Optional, public. Max 600 characters." error={errors.bio?.message}>
        <Textarea rows={3} maxLength={600} {...form.register("bio")} />
      </Field>
      <div className="space-y-4 rounded-lg border border-border p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Lock className="size-4 text-accent" aria-hidden="true" /> Private details — never shown publicly
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="email" label="Email" hint="Used to sign in.">
            <Input value={email ?? ""} readOnly disabled />
          </Field>
          <Field id="phone" label="Phone number" hint="e.g. 024 123 4567. Only you can see this." error={errors.phone?.message}>
            <Input type="tel" inputMode="tel" autoComplete="tel" {...form.register("phone")} />
          </Field>
        </div>
      </div>
      <Button type="submit" loading={pending}>
        {next ? "Save and continue" : "Save profile"}
      </Button>
    </form>
  );
}
