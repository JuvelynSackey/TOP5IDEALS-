"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-controls";
import { Alert } from "@/components/ui/display";
import { Checkbox } from "@/components/ui/primitives";
import { signUpSchema } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";
import type { z } from "zod";
import { signUpAction } from "../actions";

type FormInput = z.input<typeof signUpSchema>;

export function SignUpForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<FormInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: "", email: "", password: "", accountType: "individual", acceptTerms: false as unknown as true },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signUpAction(values);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      if (result.data.needsConfirmation) {
        setSentTo(values.email);
        return;
      }
      router.push("/dashboard/profile?setup=1");
      router.refresh();
    });
  });

  if (sentTo) {
    return (
      <div className="space-y-3 text-center" role="status">
        <MailCheck className="mx-auto size-10 text-accent" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-muted">
          If <span className="font-medium text-foreground">{sentTo}</span> can be registered, we&apos;ve sent a confirmation link. Open it on this device to finish setting up your account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">I am</legend>
        <Controller
          control={form.control}
          name="accountType"
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(
                [
                  ["individual", "An individual", "Buying, selling or swapping my own phones"],
                  ["business", "A phone business", "Dealer or shop with a storefront"],
                ] as const
              ).map(([value, title, desc]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={field.value === value}
                  onClick={() => field.onChange(value)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                    field.value === value ? "border-accent bg-accent-soft" : "border-border-strong hover:bg-surface-2",
                  )}
                >
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{desc}</span>
                </button>
              ))}
            </div>
          )}
        />
      </fieldset>
      <Field id="fullName" label="Full name" error={errors.fullName?.message}>
        <Input autoComplete="name" {...form.register("fullName")} />
      </Field>
      <Field id="email" label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </Field>
      <Field id="password" label="Password" hint="At least 8 characters, with a letter and a number." error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </Field>
      <div className="space-y-1">
        <div className="flex items-start gap-2.5">
          <Controller
            control={form.control}
            name="acceptTerms"
            render={({ field }) => (
              <Checkbox id="acceptTerms" checked={field.value === true} onCheckedChange={(v) => field.onChange(v === true)} aria-invalid={errors.acceptTerms ? true : undefined} />
            )}
          />
          <label htmlFor="acceptTerms" className="text-sm text-muted">
            I agree to the{" "}
            <Link href="/terms" className="text-accent hover:underline">
              terms of use
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-accent hover:underline">
              privacy notice
            </Link>
            .
          </label>
        </div>
        {errors.acceptTerms ? (
          <p className="text-xs font-medium text-danger" role="alert">
            {errors.acceptTerms.message}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" loading={pending}>
        Create account
      </Button>
    </form>
  );
}
