import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Camera,
  Eye,
  Handshake,
  MessageCircle,
  Repeat,
  Search,
  ShieldCheck,
  Smartphone,
  Store,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { ListingGrid } from "@/components/listings/listing-card";
import { HeroSearch } from "@/components/home/hero-search";
import { FadeIn } from "@/components/home/fade-in";
import { PRICE_BANDS } from "@/lib/catalog";
import { listingImageUrl, logoUrl } from "@/lib/storage";
import { getBrandCounts, getCatalogue, getFeaturedListings, getLatestListings, getSwapListings, getTrustedSellers } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [catalogue, featured, latest, swaps, brandCounts, sellers] = await Promise.all([
    getCatalogue(),
    getFeaturedListings(8),
    getLatestListings(8),
    getSwapListings(4),
    getBrandCounts(),
    getTrustedSellers(6),
  ]);

  const suggestions = [
    ...catalogue.models.slice(0, 60).map((m) => m.name),
    ...catalogue.brands.filter((b) => b.slug !== "other").map((b) => b.name),
    ...catalogue.regions.map((r) => r.capital),
  ];
  const heroImages = latest.map((l) => listingImageUrl(l.primary_image_path)).filter((u): u is string => Boolean(u)).slice(0, 3);

  const quickFilters = [
    { label: "iPhone", href: "/buy?brand=apple" },
    { label: "Samsung", href: "/buy?brand=samsung" },
    { label: "Under GH₵3,000", href: "/buy?max=3000" },
    { label: "Like new", href: "/buy?condition=like_new" },
    { label: "256GB", href: "/buy?storage=256" },
    { label: "Accra", href: "/buy?region=greater-accra" },
    { label: "Battery 90%+", href: "/buy?battery=90" },
    { label: "Open to swap", href: "/buy?swap=1" },
    { label: "Shops only", href: "/buy?seller=business" },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:py-20 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <FadeIn className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold tracking-[0.18em]">
              TOP5IDEALS <span className="h-3 w-px bg-border-strong" aria-hidden="true" /> <span className="tracking-normal text-accent">Buy. Sell. Swap. Upgrade.</span>
            </p>
            <h1 className="text-[2.6rem] font-bold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              FIND YOUR
              <br />
              NEXT <span className="text-accent">PHONE.</span>
            </h1>
            <p className="max-w-xl text-lg text-muted">Buy it. Sell yours. Or swap it for something better.</p>
            <HeroSearch suggestions={suggestions} />
            <div className="flex flex-wrap gap-2">
              <Button asChild size="lg">
                <Link href="/buy">
                  <Search aria-hidden="true" /> Browse Phones
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/sell">
                  <Tag aria-hidden="true" /> Sell Your Phone
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="/swap">
                  <Repeat aria-hidden="true" /> Explore Swap Deals
                </Link>
              </Button>
            </div>
            <nav aria-label="Quick filters" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              {quickFilters.map((f) => (
                <Link
                  key={f.href}
                  href={f.href}
                  className="shrink-0 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-foreground"
                >
                  {f.label}
                </Link>
              ))}
            </nav>
          </FadeIn>
          <FadeIn delay={0.1} className="hidden lg:block">
            <HeroVisual images={heroImages} />
          </FadeIn>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-12 sm:px-6">
        <Section title="Featured deals" href="/buy" linkLabel="All phones">
          {featured.length ? (
            <ListingGrid listings={featured} priorityCount={2} />
          ) : (
            <EmptyState icon={Smartphone} title="No featured deals right now" description="Our team features standout listings here. Browse the latest phones in the meantime." action={<Button asChild variant="outline"><Link href="/buy">Browse phones</Link></Button>} />
          )}
        </Section>

        <Section title="Latest phones" href="/buy?sort=newest" linkLabel="See newest">
          {latest.length ? (
            <ListingGrid listings={latest} />
          ) : (
            <EmptyState icon={Smartphone} title="No phones listed yet" description="Be the first to list a phone on Top5Ideals." action={<Button asChild><Link href="/sell">Sell your phone</Link></Button>} />
          )}
        </Section>

        <Section
          title="Swap marketplace"
          description="Phones whose owners will consider a trade — with or without cash on top."
          href="/swap"
          linkLabel="Explore swaps"
        >
          {swaps.length ? (
            <ListingGrid listings={swaps} />
          ) : (
            <EmptyState icon={Repeat} title="No swap listings yet" description="List your phone and switch on “Open to swaps” to appear here." action={<Button asChild variant="outline"><Link href="/sell">List a phone</Link></Button>} />
          )}
        </Section>

        <Section title="Browse by brand">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {brandCounts.map(({ brand, count }) => (
              <li key={brand.id}>
                <Link
                  href={`/buy?brand=${brand.slug}`}
                  className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent"
                >
                  <span className="font-display text-lg font-semibold">{brand.name}</span>
                  <span className="mt-1 text-xs text-muted">{count === 0 ? "No listings yet" : `${count} live listing${count === 1 ? "" : "s"}`}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Shop by price">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {PRICE_BANDS.map((band) => {
              const params = new URLSearchParams();
              if (band.min !== undefined) params.set("min", String(band.min / 100));
              if (band.max !== undefined) params.set("max", String(band.max / 100));
              return (
                <li key={band.label}>
                  <Link
                    href={`/buy?${params.toString()}`}
                    className="flex h-full items-center gap-3 rounded-xl border border-border bg-surface p-4 text-sm font-medium transition-colors hover:border-accent"
                  >
                    <Banknote className="size-4 shrink-0 text-accent" aria-hidden="true" />
                    {band.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Trusted sellers" description="Phone shops whose business details have been checked by our team." href="/shops" linkLabel="All shops">
          {sellers.length ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sellers.map((s) => (
                <li key={s.id}>
                  <Link href={`/shop/${s.slug}`} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-accent">
                    <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
                      {s.logo_path ? <Image src={logoUrl(s.logo_path)!} alt="" fill sizes="48px" className="object-cover" /> : <Store className="size-5 text-muted" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 font-medium">
                        <span className="truncate">{s.business_name}</span>
                        <BadgeCheck className="size-4 shrink-0 text-accent" aria-label="Verified business" />
                      </span>
                      <span className="block truncate text-xs text-muted">{[s.city, s.regions?.name].filter(Boolean).join(", ")}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Store} title="No verified shops yet" description="Businesses can request verification from their dashboard. Verified shops will appear here." />
          )}
        </Section>

        <section aria-labelledby="how-heading" className="rounded-2xl border border-border bg-surface p-6 sm:p-10">
          <h2 id="how-heading" className="text-2xl font-semibold sm:text-3xl">
            How Top5Ideals works
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {[
              { icon: Camera, title: "List or browse", text: "Sellers list a phone in a few guided steps. Every listing is checked by our moderators before it appears." },
              { icon: Repeat, title: "Offer, buy or swap", text: "Make a purchase offer or offer your own phone in exchange. Every swap states exactly who pays any cash difference." },
              { icon: Handshake, title: "Meet, confirm, review", text: "Meet in a safe public place. Both sides confirm the exchange — only then can either of you leave a review." },
            ].map((step, i) => (
              <li key={step.title} className="space-y-3">
                <span className="flex size-11 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <step.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="text-lg font-semibold">
                  <span className="mr-1 text-muted">{i + 1}.</span> {step.title}
                </h3>
                <p className="text-sm text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="safety-heading" className="grid gap-6 md:grid-cols-[0.8fr_1.2fr] md:items-start">
          <div>
            <h2 id="safety-heading" className="text-2xl font-semibold sm:text-3xl">
              Trade safely
            </h2>
            <p className="mt-2 text-sm text-muted">
              Top5Ideals does not hold money or guarantee any seller&apos;s honesty. These habits protect you on every deal.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/safety">
                Read the full safety guide <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: Eye, text: "Meet in busy, public places — a mall, a bank lobby or a police-adjacent spot." },
              { icon: Smartphone, text: "Test calls, camera, charging, Face ID or fingerprint, and check the IMEI (*#06#) before paying." },
              { icon: ShieldCheck, text: "Make sure iCloud / Google accounts are signed out and the phone is not blacklisted." },
              { icon: MessageCircle, text: "Keep conversations on Top5Ideals and never send advance payments or MoMo deposits to “hold” a phone." },
            ].map((tip) => (
              <li key={tip.text} className="flex gap-3 rounded-xl border border-border bg-surface p-4 text-sm">
                <tip.icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                {tip.text}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col items-start gap-5 rounded-2xl bg-foreground p-8 text-background sm:p-12 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-bold sm:text-4xl">Ready to upgrade?</h2>
            <p className="mt-2 max-w-lg opacity-75">List your phone in minutes, or find a swap that gets you the phone you actually want.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link href="/sell">Sell or swap your phone</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-background/30 text-background hover:bg-background/10">
              <Link href="/buy">Browse phones</Link>
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}

function Section({
  title,
  description,
  href,
  linkLabel,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  const id = title.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <section aria-labelledby={id}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id={id} className="text-2xl font-semibold">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent hover:underline">
            {linkLabel} <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function HeroVisual({ images }: { images: string[] }) {
  const frames = [0, 1, 2];
  return (
    <div className="relative mx-auto h-[440px] w-full max-w-md" aria-hidden="true">
      {frames.map((i) => {
        const src = images[i];
        const pos = ["left-0 top-10 -rotate-6", "left-1/2 top-0 z-10 -translate-x-1/2", "right-0 top-12 rotate-6"][i];
        return (
          <div key={i} className={`absolute ${pos} h-[380px] w-[190px] rounded-[2rem] border-[6px] border-foreground bg-surface-2 shadow-soft`}>
            <div className="absolute left-1/2 top-2 z-10 h-4 w-14 -translate-x-1/2 rounded-full bg-foreground" />
            <div className="relative h-full w-full overflow-hidden rounded-[1.55rem]">
              {src ? (
                <Image src={src} alt="" fill sizes="190px" className="object-cover" priority={i === 1} />
              ) : (
                <div className="flex h-full flex-col justify-end gap-2 bg-gradient-to-b from-surface-2 to-accent-soft p-4">
                  <div className="h-3 w-2/3 rounded bg-foreground/10" />
                  <div className="h-3 w-1/2 rounded bg-foreground/10" />
                  <div className="mt-2 h-8 rounded-lg bg-accent/70" />
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div className="absolute -bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium shadow-soft">
        <Repeat className="size-4 text-accent" />
        Swap + cash, clearly stated
      </div>
    </div>
  );
}
