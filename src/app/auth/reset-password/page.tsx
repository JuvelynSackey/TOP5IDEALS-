"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert, Card, CardContent } from "@/components/ui/display";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { resetPasswordAction } from "../actions";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirm: "" } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const r = await resetPasswordAction(values);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Password updated");
      router.push("/dashboard");
      router.refresh();
    });
  });

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Choose a new password</h1>
          <p className="mt-1 text-sm text-muted">This page works only from the link in your reset email.</p>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="password" label="New password" hint="At least 8 characters, with a letter and a number." error={errors.password?.message}>
            <Input type="password" autoComplete="new-password" {...form.register("password")} />
          </Field>
          <Field id="confirm" label="Confirm password" error={errors.confirm?.message}>
            <Input type="password" autoComplete="new-password" {...form.register("confirm")} />
          </Field>
          <Button type="submit" className="w-full" loading={pending}>
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
