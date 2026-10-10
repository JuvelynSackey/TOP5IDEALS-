"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/form-controls";
import type { ActionResult } from "@/lib/errors";

/**
 * A button that asks for confirmation (optionally with a required reason)
 * before running a server action, then reports the outcome as a toast.
 */
export function ConfirmButton<T>({
  label,
  title,
  description,
  confirmLabel = "Confirm",
  action,
  onDone,
  reason,
  variant = "outline",
  size = "sm",
  danger,
  children,
  disabled,
}: {
  label: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  action: (reason: string) => Promise<ActionResult<T>>;
  onDone?: (result: ActionResult<T>) => void;
  reason?: { label: string; required?: boolean; minLength?: number; placeholder?: string };
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  danger?: boolean;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const minLength = reason?.minLength ?? (reason?.required ? 5 : 0);
  const reasonInvalid = Boolean(reason?.required) && text.trim().length < minLength;

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await action(text.trim());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.message ?? "Done");
      setOpen(false);
      setText("");
      onDone?.(result);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {reason ? (
          <div className="space-y-1.5">
            <label htmlFor="confirm-reason" className="text-sm font-medium">
              {reason.label}
              {reason.required ? <span className="text-danger"> *</span> : null}
            </label>
            <Textarea id="confirm-reason" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={3} placeholder={reason.placeholder} />
          </div>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={run} loading={pending} disabled={reasonInvalid}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
