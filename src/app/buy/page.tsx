import type { Metadata } from "next";
import { SearchPage } from "@/components/listings/search-page";

export const metadata: Metadata = {
  title: "Buy phones in Ghana",
  description: "Search moderated phone listings across Ghana by brand, model, storage, condition, battery health, price and location.",
  alternates: { canonical: "/buy" },
};

export default async function BuyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <SearchPage
      rawParams={await searchParams}
      basePath="/buy"
      title="Buy a phone"
      intro="Every listing is reviewed by our team before it appears. Prices are in Ghana cedis."
    />
  );
}
