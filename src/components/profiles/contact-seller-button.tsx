"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startConversationAction } from "@/app/actions/marketplace";

export function ContactSellerButton({ userId, signedIn, label = "Message" }: { userId: string; signedIn: boolean; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={() => {
        if (!signedIn) {
          router.push(`/auth/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        startTransition(async () => {
          const r = await startConversationAction({ recipientId: userId });
          if (!r.ok) {
            toast.error(r.error);
            if (r.code === "profile_incomplete") router.push(`/dashboard/profile?setup=1&next=${encodeURIComponent(pathname)}`);
            return;
          }
          router.push(`/dashboard/messages/${r.data.conversationId}`);
        });
      }}
    >
      {pending ? null : <MessageCircle aria-hidden="true" />} {label}
    </Button>
  );
}
