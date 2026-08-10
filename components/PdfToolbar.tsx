"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Minus,
  PanelLeft,
  Plus,
  Rows3,
  Search,
  Square,
} from "lucide-react";
import clsx from "clsx";
import { useId, useState, type RefObject } from "react";

export type PdfViewMode = "single" | "scroll";

export interface PdfToolbarProps {
  currentPage: number;
  totalPages: number;
  zoom: number;
  mode: PdfViewMode;
  sidebarOpen: boolean;
  isFullscreen?: boolean;
  pageInputRef?: RefObject<HTMLInputElement | null>;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onPageChange: (page: number) => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFitWidth: () => void;
  onToggleSidebar: () => void;
  onToggleMode: () => void;
  onToggleFullscreen: () => void;
  onDownload: () => void;
  searchQuery: string;
  searchMatchIndex: number;
  searchMatchCount: number;
  isSearching: boolean;
  searchProgress?: string;
  onSearchQueryChange: (query: string) => void;
  onSearch: () => void;
  onPreviousMatch: () => void;
  onNextMatch: () => void;
  className?: string;
}

const buttonClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--text-muted)] transition hover:border-[var(--border)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-35";

interface PageNumberControlProps {
  currentPage: number;
  totalPages: number;
  inputId: string;
  errorId: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onPageChange: (page: number) => void;
}

function PageNumberControl({
  currentPage,
  totalPages,
  inputId,
  errorId,
  inputRef,
  onPageChange,
}: PageNumberControlProps) {
  const [value, setValue] = useState(String(currentPage));
  const [hasError, setHasError] = useState(false);

  const submitPage = () => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > Math.max(1, totalPages)) {
      setHasError(true);
      return;
    }
    setHasError(false);
    setValue(String(parsed));
    onPageChange(parsed);
  };

  return (
    <form
      className="relative mx-1 flex items-center gap-1 text-xs text-[var(--text-muted)]"
      onSubmit={(event) => {
        event.preventDefault();
        submitPage();
      }}
    >
      <label className="sr-only" htmlFor={inputId}>
        Хуудасны дугаар
      </label>
      <input
        ref={inputRef}
        data-pdf-page-input
        id={inputId}
        value={value}
        inputMode="numeric"
        pattern="[0-9]*"
        onChange={(event) => {
          setHasError(false);
          setValue(event.target.value);
        }}
        onBlur={() => {
          if (!hasError && value !== String(currentPage)) submitPage();
        }}
        onFocus={(event) => event.currentTarget.select()}
        className={clsx(
          "h-7 w-12 rounded-md border bg-[var(--surface-muted)] px-1 text-center text-sm font-medium text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]",
          hasError ? "border-[var(--danger)]" : "border-[var(--border)]",
        )}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
      />
      <span aria-hidden="true">/</span>
      <span className="min-w-6 tabular-nums">{totalPages}</span>
      {hasError ? (
        <span
          id={errorId}
          className="absolute left-0 top-full z-40 mt-1 whitespace-nowrap rounded-md border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--danger)] shadow-sm"
          role="alert"
        >
          Хуудасны дугаар буруу байна.
        </span>
      ) : null}
    </form>
  );
}

export function PdfToolbar({
  currentPage,
  totalPages,
  zoom,
  mode,
  sidebarOpen,
  isFullscreen = false,
  pageInputRef,
  onPreviousPage,
  onNextPage,
  onPageChange,
  onZoomOut,
  onZoomIn,
  onFitWidth,
  onToggleSidebar,
  onToggleMode,
  onToggleFullscreen,
  onDownload,
  searchQuery,
  searchMatchIndex,
  searchMatchCount,
  isSearching,
  searchProgress,
  onSearchQueryChange,
  onSearch,
  onPreviousMatch,
  onNextMatch,
  className,
}: PdfToolbarProps) {
  const idPrefix = useId();
  const pageInputId = `${idPrefix}-page`;
  const pageErrorId = `${idPrefix}-page-error`;
  const searchInputId = `${idPrefix}-search`;

  return (
    <div
      className={clsx(
        "relative z-30 flex min-h-12 shrink-0 flex-wrap items-center gap-1 border-b border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 shadow-sm",
        className,
      )}
      role="toolbar"
      aria-label="PDF удирдлага"
    >
      <button
        type="button"
        className={clsx(buttonClass, sidebarOpen && "bg-[var(--accent-soft)] text-[var(--accent)]")}
        onClick={onToggleSidebar}
        title={sidebarOpen ? "Хуудасны жагсаалт нуух" : "Хуудасны жагсаалт харуулах"}
        aria-label={sidebarOpen ? "Хуудасны жагсаалт нуух" : "Хуудасны жагсаалт харуулах"}
        aria-pressed={sidebarOpen}
      >
        <PanelLeft className="size-4" aria-hidden="true" />
      </button>

      <span className="mx-1 h-6 w-px bg-[var(--border)]" aria-hidden="true" />

      <button
        type="button"
        data-pdf-action="previous-page"
        className={buttonClass}
        onClick={onPreviousPage}
        disabled={currentPage <= 1}
        title="Өмнөх хуудас"
        aria-label="Өмнөх хуудас"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        data-pdf-action="next-page"
        className={buttonClass}
        onClick={onNextPage}
        disabled={currentPage >= totalPages}
        title="Дараагийн хуудас"
        aria-label="Дараагийн хуудас"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>

      <PageNumberControl
        key={currentPage}
        currentPage={currentPage}
        totalPages={totalPages}
        inputId={pageInputId}
        errorId={pageErrorId}
        inputRef={pageInputRef}
        onPageChange={onPageChange}
      />

      <span className="mx-1 h-6 w-px bg-[var(--border)]" aria-hidden="true" />

      <button
        type="button"
        data-pdf-action="zoom-out"
        className={buttonClass}
        onClick={onZoomOut}
        disabled={zoom <= 0.5}
        title="Жижигрүүлэх"
        aria-label="Жижигрүүлэх"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className="w-11 text-center text-xs font-medium tabular-nums text-[var(--text)]">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        data-pdf-action="zoom-in"
        className={buttonClass}
        onClick={onZoomIn}
        disabled={zoom >= 3}
        title="Томруулах"
        aria-label="Томруулах"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="mx-1 h-8 shrink-0 rounded-md border border-[var(--border)] px-2.5 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        onClick={onFitWidth}
        title="Хуудасны өргөнийг цонхонд тааруулах"
      >
        Өргөнд
      </button>

      <span className="mx-1 hidden h-6 w-px bg-[var(--border)] sm:block" aria-hidden="true" />

      <form
        className="order-last flex h-8 min-w-[210px] flex-1 items-center rounded-md border border-[var(--border)] bg-[var(--surface-muted)] pl-2 focus-within:ring-2 focus-within:ring-[var(--accent)] sm:order-none sm:max-w-xs"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
        role="search"
      >
        {isSearching ? (
          <LoaderCircle className="size-3.5 shrink-0 animate-spin text-[var(--accent)]" aria-hidden="true" />
        ) : (
          <Search className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
        )}
        <label className="sr-only" htmlFor={searchInputId}>
          PDF дотроос хайх
        </label>
        <input
          id={searchInputId}
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="PDF дотроос хайх..."
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
        />
        {(searchMatchCount > 0 || isSearching || Boolean(searchProgress)) && (
          <span
            className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-[var(--text-muted)]"
            title={searchProgress}
            aria-live="polite"
          >
            {searchMatchCount > 0
              ? `${searchMatchIndex + 1} / ${searchMatchCount}`
              : searchProgress || "Хайж байна…"}
          </span>
        )}
        <button
          type="button"
          className="ml-1 inline-flex size-7 shrink-0 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
          onClick={onPreviousMatch}
          disabled={searchMatchCount === 0}
          title="Өмнөх илэрц"
          aria-label="Өмнөх илэрц"
        >
          <ChevronUp className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30"
          onClick={onNextMatch}
          disabled={searchMatchCount === 0}
          title="Дараагийн илэрц"
          aria-label="Дараагийн илэрц"
        >
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      </form>

      <div className="ml-auto flex items-center gap-0.5">
        <button
          type="button"
          className={buttonClass}
          onClick={onToggleMode}
          title={mode === "single" ? "Босоо гүйлгэх горим" : "Нэг хуудасны горим"}
          aria-label={mode === "single" ? "Босоо гүйлгэх горим" : "Нэг хуудасны горим"}
        >
          {mode === "single" ? (
            <Rows3 className="size-4" aria-hidden="true" />
          ) : (
            <Square className="size-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={onToggleFullscreen}
          title={isFullscreen ? "Бүтэн дэлгэцээс гарах" : "Бүтэн дэлгэц"}
          aria-label={isFullscreen ? "Бүтэн дэлгэцээс гарах" : "Бүтэн дэлгэц"}
        >
          {isFullscreen ? (
            <Minimize2 className="size-4" aria-hidden="true" />
          ) : (
            <Maximize2 className="size-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={onDownload}
          title="PDF татах"
          aria-label="PDF татах"
        >
          <Download className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
