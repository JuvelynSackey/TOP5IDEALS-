import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/display";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default function SignUpPage() {
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Create your account</h1>
          <p className="mt-1 text-sm text-muted">Free for buyers, sellers and phone shops.</p>
        </div>
        <SignUpForm />
        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-accent hover:underline">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
