import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, Alert } from "@/components/ui/display";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Log in to manage listings, offers and messages.</p>
        </div>
        {params.error === "link_invalid" ? (
          <Alert tone="warning" title="That link has expired or was already used.">
            Log in, or request a new password reset link.
          </Alert>
        ) : null}
        <LoginForm next={params.next} />
        <p className="text-center text-sm text-muted">
          New to Top5Ideals?{" "}
          <Link href={`/auth/signup${params.next ? `?next=${encodeURIComponent(params.next)}` : ""}`} className="font-medium text-accent hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
