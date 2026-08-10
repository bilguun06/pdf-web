"use client";

import { X } from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeOnBackdrop?: boolean;
  closeButtonLabel?: string;
  ariaDescribedBy?: string;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-xl",
} as const;

const focusableSelector = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const subscribeToClient = () => () => undefined;

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
  closeButtonLabel = "Хаах",
  ariaDescribedBy,
}: DialogProps) {
  const mounted = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false,
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const autoFocusElement = panelRef.current?.querySelector<HTMLElement>("[autofocus]");
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      (autoFocusElement ?? firstFocusable ?? panelRef.current)?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  const closeFromBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && event.currentTarget === event.target) {
      onOpenChange(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-[2px]"
      onMouseDown={closeFromBackdrop}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={ariaDescribedBy ?? (description ? descriptionId : undefined)}
        tabIndex={-1}
        className={clsx(
          "animate-in flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text)] shadow-[var(--shadow)] outline-none",
          sizeClasses[size],
        )}
      >
        <div className="flex shrink-0 items-start gap-4 border-b border-[var(--border)] px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-bold tracking-[-0.01em] sm:text-lg">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={closeButtonLabel}
            className="-mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>

        {footer ? (
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
