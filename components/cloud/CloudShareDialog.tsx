"use client";

import {
  AlertCircle,
  Check,
  CloudUpload,
  Copy,
  ExternalLink,
  KeyRound,
  Link2,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { CloudBinding, CloudSyncProgress } from "@/hooks/useCloudProject";

export interface CloudShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binding: CloudBinding | null;
  progress: CloudSyncProgress;
  isSaving: boolean;
  error?: string | null;
  warning?: string | null;
  onRetry: () => void;
}

async function copyToClipboard(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard API ашиглах боломжгүй байна.");
  }
  await navigator.clipboard.writeText(value);
}

export function CloudShareDialog({
  open,
  onOpenChange,
  binding,
  progress,
  isSaving,
  error,
  warning,
  onRetry,
}: CloudShareDialogProps) {
  const [copied, setCopied] = useState<"share" | "editor" | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCopied(null);
      setCopyError(null);
    }
    onOpenChange(nextOpen);
  };

  const copy = async (kind: "share" | "editor", value: string) => {
    try {
      await copyToClipboard(value);
      setCopyError(null);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1_800);
    } catch (caught) {
      setCopyError(caught instanceof Error ? caught.message : "Холбоосыг хуулж чадсангүй.");
    }
  };

  const hasPublishedCopy = Boolean(binding?.lastSyncedAt);

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={hasPublishedCopy ? "Төсөл хуваалцах" : "Cloud-д хадгалах"}
      description={
        hasPublishedCopy
          ? "Public холбоостой хүн төслийг зөвхөн үзэх боломжтой."
          : "PDF файлууд Vercel Blob, бүлгийн мэдээлэл cloud database-д хадгалагдана."
      }
      size="lg"
      closeOnBackdrop={!isSaving}
      footer={
        <>
          <Button variant="secondary" onClick={() => handleOpenChange(false)} disabled={isSaving}>
            Хаах
          </Button>
          {error ? (
            <Button variant="primary" onClick={onRetry} disabled={isSaving}>
              Дахин оролдох
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        {isSaving ? (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4" aria-live="polite">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <CloudUpload aria-hidden="true" className="size-5 animate-pulse" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3 text-sm font-bold">
                  <span className="truncate">{progress.message}</span>
                  <span className="shrink-0 tabular-nums">{progress.percent}%</span>
                </div>
                {progress.currentFile ? (
                  <p className="mt-1 truncate text-xs text-[var(--text-muted)]" title={progress.currentFile}>
                    {progress.currentFile}
                    {progress.totalFiles > 0
                      ? ` · ${progress.completedFiles}/${progress.totalFiles}`
                      : ""}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
              />
            </div>
          </section>
        ) : null}

        {error ? (
          <div className="flex gap-3 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]" role="alert">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-bold">Cloud хадгалалт бүрэн дуусаагүй.</p>
              <p className="mt-1 leading-6">{error}</p>
              {binding ? (
                <p className="mt-2 text-xs leading-5">
                  Үүссэн cloud төсөл хадгалагдсан. “Дахин оролдох” дарахад үлдсэн файлуудаас үргэлжилнэ.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {warning ? (
          <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="status">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p className="leading-6">{warning}</p>
          </div>
        ) : null}

        {hasPublishedCopy && binding ? (
          <section className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                <Link2 aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold">Зөвхөн үзэх public холбоос</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                  Group устгах, PDF солих, төслийг өөрчлөх эрх өгөхгүй.
                </p>
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={binding.shareUrl}
                aria-label="Public share холбоос"
                onFocus={(event) => event.currentTarget.select()}
                className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
              />
              <Button variant="primary" onClick={() => void copy("share", binding.shareUrl)}>
                {copied === "share" ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied === "share" ? "Хуулагдлаа" : "Хуулах"}
              </Button>
              <Button
                variant="secondary"
                aria-label="Public холбоос нээх"
                onClick={() => window.open(binding.shareUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="size-4" />
                <span className="sm:hidden lg:inline">Нээх</span>
              </Button>
            </div>
          </section>
        ) : null}

        {binding ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-start gap-3">
              <KeyRound aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Editor холбоос бол нууц түлхүүр</p>
                <p className="mt-1 text-xs leading-5">
                  Энэ холбоостой хүн төслийг өөрчилж чадна. Token-ийг дэлгэцэд харуулахгүй;
                  холбоосыг зөвхөн өөртөө хуулж хадгална уу. Browser data цэвэрлэвэл уг эрхийг
                  сэргээх боломжгүй байж болно.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 border-amber-300 bg-white"
                  onClick={() => void copy("editor", binding.editorUrl)}
                >
                  {copied === "editor" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied === "editor" ? "Editor холбоос хуулагдлаа" : "Editor холбоос хуулах"}
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {copyError ? (
          <p className="text-sm font-medium text-[var(--danger)]" role="alert">{copyError}</p>
        ) : null}
      </div>
    </Dialog>
  );
}
