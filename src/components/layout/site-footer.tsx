import Link from "next/link";
import { Logo } from "./logo";

const COLUMNS = [
  {
    title: "Marketplace",
    links: [
      { href: "/buy", label: "Buy a phone" },
      { href: "/sell", label: "Sell your phone" },
      { href: "/swap", label: "Swap marketplace" },
      { href: "/shops", label: "Phone shops" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/dashboard/offers", label: "Offers & swaps" },
      { href: "/dashboard/messages", label: "Messages" },
      { href: "/dashboard/verification", label: "Get verified" },
    ],
  },
  {
    title: "Trust & safety",
    links: [
      { href: "/safety", label: "Safety guide" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/terms", label: "Terms of use" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-surface pb-20 md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted">Buy. Sell. Swap. Upgrade. A Ghana-first marketplace for phones, built around fair, transparent swaps.</p>
          <p className="text-xs text-muted">Prices in Ghana cedis (GH₵). Top5Ideals does not process payments — meet safely and inspect before you pay.</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-semibold">{col.title}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Top5Ideals. Made for Ghana.</p>
          <p>Report suspicious activity from any listing, message or exchange.</p>
        </div>
      </div>
    </footer>
  );
}
