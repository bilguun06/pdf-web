"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import type { PDFDocumentProxy } from "pdfjs-dist";

import { PdfPageCanvas } from "@/components/PdfPageCanvas";

export interface ThumbnailSidebarProps {
  document: PDFDocumentProxy;
  pageCount: number;
  currentPage: number;
  onPageSelect: (page: number) => void;
  onError?: (message: string) => void;
  className?: string;
}

export function ThumbnailSidebar({
  document,
  pageCount,
  currentPage,
  onPageSelect,
  onError,
  className,
}: ThumbnailSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual intentionally exposes a mutable virtualizer instance.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 184,
    overscan: 3,
    getItemKey: (index) => index + 1,
  });

  useEffect(() => {
    if (currentPage < 1 || currentPage > pageCount) return;
    virtualizer.scrollToIndex(currentPage - 1, { align: "auto" });
  }, [currentPage, pageCount, virtualizer]);

  return (
    <aside
      className={clsx(
        "flex h-full w-44 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] shadow-[4px_0_18px_rgb(15_23_42/0.05)]",
        className,
      )}
      aria-label="PDF хуудасны жагсаалт"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
        <span className="text-xs font-semibold text-[var(--text)]">Хуудаснууд</span>
        <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
          {pageCount}
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const pageNumber = virtualItem.index + 1;
            const selected = pageNumber === currentPage;

            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                className="absolute left-0 top-0 flex w-full justify-center px-2 py-2"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <button
                  type="button"
                  onClick={() => onPageSelect(pageNumber)}
                  className={clsx(
                    "group flex w-full flex-col items-center gap-1.5 rounded-lg border p-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
                    selected
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-sm"
                      : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-muted)]",
                  )}
                  aria-label={`${pageNumber}-р хуудас руу очих`}
                  aria-current={selected ? "page" : undefined}
                >
                  <PdfPageCanvas
                    document={document}
                    pageNumber={pageNumber}
                    width={112}
                    thumbnail
                    onError={onError}
                  />
                  <span
                    className={clsx(
                      "text-[11px] font-medium tabular-nums",
                      selected
                        ? "text-[var(--accent)]"
                        : "text-[var(--text-muted)] group-hover:text-[var(--text)]",
                    )}
                  >
                    {pageNumber}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
