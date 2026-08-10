"use client";

import { AlertTriangle } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}

function ConfirmDialogContent({
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = "Үргэлжлүүлэх",
  cancelLabel = "Болих",
  destructive = false,
  loading = false,
}: Omit<ConfirmDialogProps, "open">) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const descriptionId = useId();
  const busy = loading || submitting;

  const confirm = async () => {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (reason) {
      setSubmitError(
        reason instanceof Error && reason.message
          ? reason.message
          : "Үйлдлийг гүйцэтгэж чадсангүй.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={title}
      ariaDescribedBy={descriptionId}
      size="sm"
      closeOnBackdrop={!busy}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            autoFocus
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={() => void confirm()}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {destructive ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--danger-soft)] text-[var(--danger)]">
            <AlertTriangle aria-hidden="true" className="size-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p id={descriptionId} className="text-sm leading-6 text-[var(--text-muted)]">
            {description}
          </p>
          {submitError ? (
            <p role="alert" className="mt-3 text-sm font-medium text-[var(--danger)]">
              {submitError}
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return <ConfirmDialogContent {...props} />;
}
