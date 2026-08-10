"use client";

import { AlertTriangle, FileText, LoaderCircle, UploadCloud } from "lucide-react";
import { clsx } from "clsx";
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/Button";
import {
  MAX_PDF_SIZE_BYTES,
  formatFileSize,
  validatePdfFile,
} from "@/lib/file";

export interface PdfDropZoneProps {
  onFileSelect: (file: File) => void | Promise<void>;
  isLoading?: boolean;
  loadingMessage?: string;
  error?: string | null;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

export function PdfDropZone({
  onFileSelect,
  isLoading = false,
  loadingMessage = "PDF уншиж байна...",
  error,
  disabled = false,
  compact = false,
  className,
}: PdfDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const loading = isLoading || submitting;
  const visibleError = error || localError;
  const unavailable = disabled || loading;

  const openPicker = () => {
    if (!unavailable) inputRef.current?.click();
  };

  const handleFile = async (file?: File) => {
    if (!file || unavailable) return;
    setLocalError(null);
    const validationError = validatePdfFile(file);
    if (validationError) {
      setLocalError(validationError);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setSubmitting(true);
    try {
      await onFileSelect(file);
    } catch (reason) {
      setLocalError(
        reason instanceof Error && reason.message
          ? reason.message
          : "PDF файлыг нээж чадсангүй.",
      );
    } finally {
      setSubmitting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0]);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (unavailable) return;
    dragDepth.current += 1;
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragActive(false);
    if (unavailable) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 1) {
      setLocalError("Нэг удаад нэг PDF файл сонгоно уу.");
      return;
    }
    void handleFile(files[0]);
  };

  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  };

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleInput}
        disabled={unavailable}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div
        role="button"
        tabIndex={unavailable ? -1 : 0}
        aria-disabled={unavailable}
        aria-label="PDF файл сонгох эсвэл энд чирж оруулах"
        onClick={openPicker}
        onKeyDown={handleKeyboard}
        onDragEnter={handleDragEnter}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = unavailable ? "none" : "copy";
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={clsx(
          "relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-[var(--surface)] px-6 text-center outline-none transition-[border-color,background-color,box-shadow,transform] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
          compact ? "min-h-52 py-8" : "min-h-[320px] py-12",
          dragActive
            ? "scale-[1.005] border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_12px_40px_color-mix(in_srgb,var(--accent)_14%,transparent)]"
            : visibleError
              ? "border-[var(--danger)]"
              : "border-[var(--border-strong)] hover:border-[var(--accent)] hover:bg-[var(--surface-muted)]",
          unavailable && "cursor-not-allowed opacity-65",
          !unavailable && "cursor-pointer",
        )}
      >
        <div
          aria-hidden="true"
          className={clsx(
            "mb-5 flex size-14 items-center justify-center rounded-2xl transition-colors",
            dragActive
              ? "bg-[var(--accent)] text-[Canvas]"
              : visibleError
                ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                : "bg-[var(--accent-soft)] text-[var(--accent)]",
          )}
        >
          {loading ? (
            <LoaderCircle className="size-7 animate-spin" />
          ) : visibleError ? (
            <AlertTriangle className="size-7" />
          ) : dragActive ? (
            <FileText className="size-7" />
          ) : (
            <UploadCloud className="size-7" />
          )}
        </div>

        <h2 className="text-base font-extrabold tracking-[-0.01em] text-[var(--text)] sm:text-lg">
          {loading
            ? loadingMessage
            : dragActive
              ? "PDF файлаа энд тавина уу"
              : "PDF файлаа энд чирж оруулна уу"}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">
          {loading
            ? "Хуудасны тоог шалгаж байна. Том файлд бага зэрэг хугацаа орж болно."
            : `Зөвхөн PDF төрлийн, ${formatFileSize(MAX_PDF_SIZE_BYTES)} хүртэл хэмжээтэй нэг файл сонгоно.`}
        </p>

        {!loading ? (
          <div className="mt-6 flex flex-col items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              эсвэл
            </span>
            <Button
              variant="primary"
              onClick={(event) => {
                event.stopPropagation();
                openPicker();
              }}
              disabled={disabled}
            >
              <FileText aria-hidden="true" className="size-4" />
              PDF сонгох
            </Button>
          </div>
        ) : null}
      </div>

      {visibleError ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3.5 py-3 text-sm font-medium text-[var(--danger)]"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{visibleError}</span>
        </div>
      ) : null}
    </div>
  );
}
