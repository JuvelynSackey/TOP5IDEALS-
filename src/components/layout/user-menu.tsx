"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  BarChart3,
  Heart,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Repeat,
  Shield,
  Store,
  User,
  Wallet,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/auth/actions";

export function UserMenu({
  name,
  username,
  avatar,
  isStaff,
  isBusiness,
}: {
  name: string;
  username: string | null;
  avatar: string | null;
  isStaff: boolean;
  isBusiness: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      const result = await signOutAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push("/");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ml-1 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="Account menu">
        <Avatar src={avatar} name={name} size={34} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-sm text-foreground">
          <span className="block truncate font-semibold">{name}</span>
          {username ? <span className="block truncate text-xs font-normal text-muted">@{username}</span> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <MenuLink href="/dashboard" icon={LayoutDashboard} label="Dashboard" />
        <MenuLink href="/dashboard/listings" icon={ListOrdered} label="My listings" />
        <MenuLink href="/dashboard/offers" icon={Repeat} label="Offers & swaps" />
        <MenuLink href="/dashboard/transactions" icon={Wallet} label="Transactions" />
        <MenuLink href="/dashboard/favorites" icon={Heart} label="Saved phones" />
        <MenuLink href="/dashboard/profile" icon={User} label="Profile & settings" />
        {isBusiness ? (
          <>
            <DropdownMenuSeparator />
            <MenuLink href="/dashboard/storefront" icon={Store} label="Storefront" />
            <MenuLink href="/dashboard/analytics" icon={BarChart3} label="Analytics" />
          </>
        ) : null}
        <MenuLink href="/dashboard/verification" icon={BadgeCheck} label="Verification" />
        {isStaff ? (
          <>
            <DropdownMenuSeparator />
            <MenuLink href="/admin" icon={Shield} label="Admin" />
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} disabled={pending}>
          <LogOut aria-hidden="true" /> {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ "aria-hidden"?: boolean }>; label: string }) {
  return (
    <DropdownMenuItem asChild>
      <Link href={href}>
        <Icon aria-hidden={true} /> {label}
      </Link>
    </DropdownMenuItem>
  );
}
