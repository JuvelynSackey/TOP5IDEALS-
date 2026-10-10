"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/dashboard/confirm-button";
import {
  moderateListingAction,
  removeFeaturedAction,
  resolveDisputeAction,
  resolveReportAction,
  reviewVerificationAction,
  setAccountStatusAction,
  setReviewHiddenAction,
  verificationDocumentUrlAction,
} from "@/app/actions/admin";

function useRefresh() {
  const router = useRouter();
  return () => router.refresh();
}

export function ModerateButtons({ listingId, canApprove = true }: { listingId: string; canApprove?: boolean }) {
  const refresh = useRefresh();
  return (
    <div className="flex flex-wrap gap-2">
      {canApprove ? (
      <ConfirmButton
        label="Approve"
        variant="primary"
        title="Approve and publish this listing?"
        description="It will appear in search immediately and the seller will be notified."
        confirmLabel="Approve"
        reason={{ label: "Internal note (optional)" }}
        action={(reason) => moderateListingAction(listingId, "approve", reason)}
        onDone={refresh}
      />
      ) : null}
      <ConfirmButton
        label={canApprove ? "Reject" : "Take down"}
        danger
        title="Reject this listing?"
        description="The seller sees your reason and can fix the listing and resubmit."
        confirmLabel="Reject"
        reason={{ label: "Reason shown to the seller", required: true, placeholder: "e.g. Photos must show the actual phone, including the screen switched on." }}
        action={(reason) => moderateListingAction(listingId, "reject", reason)}
        onDone={refresh}
      />
    </div>
  );
}

export function ReportButtons({ reportId, status }: { reportId: string; status: string }) {
  const refresh = useRefresh();
  return (
    <div className="flex flex-wrap gap-2">
      {status === "open" ? (
        <ConfirmButton label="Mark reviewing" title="Mark as under review?" confirmLabel="Mark reviewing" action={(n) => resolveReportAction(reportId, "reviewing", n)} onDone={refresh} />
      ) : null}
      <ConfirmButton label="Resolve" variant="primary" title="Resolve this report?" confirmLabel="Resolve" reason={{ label: "Resolution note", required: true }} action={(n) => resolveReportAction(reportId, "resolved", n)} onDone={refresh} />
      <ConfirmButton label="Dismiss" title="Dismiss this report?" confirmLabel="Dismiss" reason={{ label: "Why is no action needed?", required: true }} action={(n) => resolveReportAction(reportId, "dismissed", n)} onDone={refresh} />
    </div>
  );
}

export function DisputeButtons({ disputeId }: { disputeId: string }) {
  const refresh = useRefresh();
  const reason = { label: "Resolution note (shared with both parties)", required: true };
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmButton label="Complete exchange" variant="primary" title="Mark the exchange as completed?" description="Listings become sold/swapped and both parties can review each other." confirmLabel="Complete" reason={reason} action={(n) => resolveDisputeAction(disputeId, "complete", n)} onDone={refresh} />
      <ConfirmButton label="Cancel exchange" danger title="Cancel the exchange?" description="Reservations are released and listings return to the marketplace." confirmLabel="Cancel exchange" reason={reason} action={(n) => resolveDisputeAction(disputeId, "cancel", n)} onDone={refresh} />
      <ConfirmButton label="Dismiss dispute" title="Dismiss the dispute?" description="The exchange continues and both parties can confirm again." confirmLabel="Dismiss" reason={reason} action={(n) => resolveDisputeAction(disputeId, "dismiss", n)} onDone={refresh} />
    </div>
  );
}

export function AccountStatusButton({ userId, status }: { userId: string; status: "active" | "suspended" }) {
  const refresh = useRefresh();
  return status === "active" ? (
    <ConfirmButton
      label="Suspend"
      danger
      title="Suspend this account?"
      description="Their live listings are paused, open offers closed, and they can't list, message or make offers. Active exchanges continue through the dispute process."
      confirmLabel="Suspend"
      reason={{ label: "Reason (recorded in the audit log)", required: true }}
      action={(r) => setAccountStatusAction(userId, "suspended", r)}
      onDone={refresh}
    />
  ) : (
    <ConfirmButton label="Reinstate" title="Reinstate this account?" confirmLabel="Reinstate" reason={{ label: "Reason", required: true }} action={(r) => setAccountStatusAction(userId, "active", r)} onDone={refresh} />
  );
}

export function VerificationButtons({ requestId, paths }: { requestId: string; paths: string[] }) {
  const refresh = useRefresh();
  const [pending, startTransition] = useTransition();
  const [opening, setOpening] = useState<string | null>(null);
  const open = (path: string) => {
    setOpening(path);
    startTransition(async () => {
      const r = await verificationDocumentUrlAction(path);
      setOpening(null);
      if (!r.ok) toast.error(r.error);
      else window.open(r.data.url, "_blank", "noopener,noreferrer");
    });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {paths.map((p, i) => (
          <Button key={p} variant="secondary" size="sm" onClick={() => open(p)} loading={pending && opening === p}>
            <ExternalLink aria-hidden="true" /> Document {i + 1}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted">Links expire after 2 minutes. Do not download or share documents outside this review.</p>
      <div className="flex flex-wrap gap-2">
        <ConfirmButton label="Approve" variant="primary" title="Approve verification?" confirmLabel="Approve" reason={{ label: "Note (optional)" }} action={(n) => reviewVerificationAction(requestId, true, n)} onDone={refresh} />
        <ConfirmButton label="Reject" danger title="Reject verification?" confirmLabel="Reject" reason={{ label: "Reason shown to the applicant", required: true }} action={(n) => reviewVerificationAction(requestId, false, n)} onDone={refresh} />
      </div>
    </div>
  );
}

export function ReviewVisibilityButton({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  const refresh = useRefresh();
  return (
    <ConfirmButton
      label={hidden ? "Restore" : "Hide"}
      danger={!hidden}
      title={hidden ? "Restore this review?" : "Hide this review?"}
      confirmLabel={hidden ? "Restore" : "Hide"}
      reason={{ label: "Reason", required: true }}
      action={(r) => setReviewHiddenAction(reviewId, !hidden, r)}
      onDone={refresh}
    />
  );
}

export function RemoveFeaturedButton({ id }: { id: string }) {
  const refresh = useRefresh();
  return <ConfirmButton label="Remove" title="Remove from featured?" confirmLabel="Remove" action={() => removeFeaturedAction(id)} onDone={refresh} />;
}
