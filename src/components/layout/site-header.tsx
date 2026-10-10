import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { avatarUrl } from "@/lib/storage";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { HeaderSearch } from "./header-search";
import { NavLinks } from "./nav-links";
import { HeaderCounters } from "./header-counters";

async function getCounts(viewerId: string) {
  const supabase = await createClient();
  const [notifications, messages] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", viewerId).is("read_at", null),
    supabase.rpc("unread_message_count"),
  ]);
  return { notifications: notifications.count ?? 0, messages: messages.data ?? 0 };
}

export async function SiteHeader() {
  const viewer = await getViewer();
  const counts = viewer ? await getCounts(viewer.id) : null;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-foreground">
        Skip to content
      </a>
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:h-16 sm:px-6">
        <Logo />
        <NavLinks />
        <div className="hidden flex-1 justify-center lg:flex">
          <Suspense fallback={null}>
            <HeaderSearch />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          {viewer ? (
            <>
              <HeaderCounters viewerId={viewer.id} initialNotifications={counts?.notifications ?? 0} initialMessages={counts?.messages ?? 0} />
              <Button asChild size="sm" className="ml-1 hidden sm:inline-flex">
                <Link href="/sell">
                  <Plus aria-hidden="true" /> Sell
                </Link>
              </Button>
              <UserMenu
                name={viewer.profile.full_name || viewer.profile.username || "Account"}
                username={viewer.profile.username}
                avatar={avatarUrl(viewer.profile.avatar_path)}
                isStaff={viewer.isStaff}
                isBusiness={viewer.profile.account_type === "business"}
              />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/auth/login">Log in</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/auth/signup">Create account</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

