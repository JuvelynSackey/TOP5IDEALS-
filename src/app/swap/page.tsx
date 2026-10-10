import type { Metadata } from "next";
import Link from "next/link";
import { SearchPage } from "@/components/listings/search-page";

export const metadata: Metadata = {
  title: "Swap your phone",
  description: "Phones in Ghana whose owners accept swaps. Offer your phone plus or minus cash, with the cash difference spelled out clearly.",
  alternates: { canonical: "/swap" },
};

export default async function SwapPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <SearchPage
      rawParams={await searchParams}
      basePath="/swap"
      title="Swap marketplace"
      swapOnly
      intro={
        <>
          These owners will consider trading. Open a phone and choose <strong className="text-foreground">Make swap offer</strong> to offer one of your own listed phones — plus or minus cash.{" "}
          <Link href="/how-it-works#swaps" className="text-accent hover:underline">
            How swaps work
          </Link>
        </>
      }
    />
  );
}
