"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/display";
import { Field, Select, Textarea } from "@/components/ui/form-controls";
import { getBrowserClient } from "@/lib/supabase/client";
import { MAX_DOCUMENT_BYTES } from "@/lib/storage";
import { randomFileName } from "@/lib/image-processing";
import { submitVerificationAction } from "@/app/actions/account";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** Documents go to the PRIVATE verification-docs bucket; only the owner and admins can read them. */
export function VerificationForm({ userId, hasBusiness }: { userId: string; hasBusiness: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"individual" | "business">(hasBusiness ? "business" : "individual");
  const [note, setNote] = useState("");
  const [docs, setDocs] = useState<{ name: string; path: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5 - docs.length)) {
        const ext = TYPES[file.type];
        if (!ext) throw new Error(`${file.name}: use a PDF, JPEG, PNG or WebP file.`);
        if (file.size > MAX_DOCUMENT_BYTES) throw new Error(`${file.name} is larger than 10MB.`);
        const path = `${userId}/${randomFileName(ext)}`;
        const { error: uploadError } = await getBrowserClient().storage.from("verification-docs").upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw new Error(uploadError.message);
        setDocs((d) => [...d, { name: file.name, path }]);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const r = await submitVerificationAction({ kind, note, paths: docs.map((d) => d.path) });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(r.message ?? "Submitted");
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field id="kind" label="What do you want verified?">
        <Select value={kind} onChange={(e) => setKind(e.target.value as "individual" | "business")}>
          <option value="individual">My identity (individual seller)</option>
          <option value="business" disabled={!hasBusiness}>
            My business{hasBusiness ? "" : " — create a storefront first"}
          </option>
        </Select>
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-medium">Documents</p>
        <p className="text-xs text-muted">
          {kind === "business"
            ? "Business registration certificate and a Ghana Card of the owner. Up to 5 files, 10MB each."
            : "A clear photo of your Ghana Card (front and back). Up to 5 files, 10MB each."}
        </p>
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.path} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="truncate">{d.name}</span>
              </span>
              <Button variant="ghost" size="icon-sm" onClick={() => setDocs((x) => x.filter((y) => y.path !== d.path))} aria-label={`Remove ${d.name}`}>
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        {docs.length < 5 ? (
          <Button variant="outline" onClick={() => ref.current?.click()} loading={uploading}>
            {uploading ? null : <Upload aria-hidden="true" />} Upload document
          </Button>
        ) : null}
        <input ref={ref} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void upload(e.target.files)} />
      </div>
      <Field id="note" label="Note for the reviewer (optional)">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />
      </Field>
      <Button onClick={submit} loading={pending} disabled={!docs.length || uploading}>
        Submit for verification
      </Button>
    </div>
  );
}
