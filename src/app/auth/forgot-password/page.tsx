"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert, Card, CardContent } from "@/components/ui/display";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { forgotPasswordAction } from "../actions";

export default function ForgotPasswordPage() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const form = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const r = await forgotPasswordAction(values);
      setResult(r.ok ? { ok: true, message: r.message ?? "Check your email." } : { ok: false, message: r.error });
    });
  });

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Reset your password</h1>
          <p className="mt-1 text-sm text-muted">We&apos;ll email you a secure link to choose a new password.</p>
        </div>
        {result ? <Alert tone={result.ok ? "success" : "danger"}>{result.message}</Alert> : null}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="email" label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
          </Field>
          <Button type="submit" className="w-full" loading={pending}>
            Send reset link
          </Button>
        </form>
        <p className="text-center text-sm">
          <Link href="/auth/login" className="text-accent hover:underline">
            Back to log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
