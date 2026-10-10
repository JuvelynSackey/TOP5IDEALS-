import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { Providers } from "@/components/layout/providers";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { MobileNav } from "@/components/layout/mobile-nav";
import { getSiteUrl } from "@/lib/env";

const body = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const heading = Space_Grotesk({ subsets: ["latin"], variable: "--font-heading", display: "swap", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: "Top5Ideals — Buy, sell and swap phones in Ghana", template: "%s · Top5Ideals" },
  description:
    "Ghana's marketplace for buying, selling and swapping phones. Moderated listings, transparent swap offers with clear cash differences, and reviews from completed exchanges.",
  applicationName: "Top5Ideals",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Top5Ideals",
    locale: "en_GH",
    title: "Top5Ideals — Buy. Sell. Swap. Upgrade.",
    description: "Find your next phone in Ghana. Buy it, sell yours, or swap it for something better.",
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GH" suppressHydrationWarning className={`${body.variable} ${heading.variable}`}>
      <body className="min-h-dvh">
        <Providers>
          <Suspense fallback={<div className="h-14 border-b border-border sm:h-16" />}>
            <SiteHeader />
          </Suspense>
          <main id="main" className="pb-20 md:pb-0">
            {children}
          </main>
          <SiteFooter />
          <MobileNav />
        </Providers>
      </body>
    </html>
  );
}
