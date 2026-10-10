import { ShieldCheck } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-5xl items-center gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1fr_minmax(0,420px)]">
      <aside className="hidden md:block">
        <p className="text-sm font-medium text-accent">Buy. Sell. Swap. Upgrade.</p>
        <h2 className="mt-3 text-4xl font-bold leading-tight">Trade phones with people you can actually trust.</h2>
        <ul className="mt-6 space-y-3 text-sm text-muted">
          {[
            "Every listing is reviewed before it goes live.",
            "Swap offers spell out exactly who pays any cash difference.",
            "Both sides confirm an exchange before it counts — and reviews only come from real, completed deals.",
          ].map((t) => (
            <li key={t} className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
      </aside>
      <div className="w-full">{children}</div>
    </div>
  );
}
