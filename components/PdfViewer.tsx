"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { FileWarning, LoaderCircle } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import type { PDFPageProxy } from "pdfjs-dist";

import {
  clearPdfPageCache,
  PdfPageCanvas,
} from "@/components/PdfPageCanvas";
import {
  PdfToolbar,
  type PdfViewMode,
} from "@/components/PdfToolbar";
import { ThumbnailSidebar } from "@/components/ThumbnailSidebar";
import { usePdfDocument } from "@/hooks/usePdfDocument";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const FIT_WIDTH_ZOOM = 1;
const DEFAULT_DESKTOP_ZOOM = 0.75;
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";

export interface PdfViewerProps {
  source: Blob | File;
  fileName: string;
  pageCount?: number;
  initialPage?: number;
  onPageChange?: (page: number) => void;
  onError?: (message: string) => void;
  /** Called only when PDF.js cannot open the document itself. */
  onDocumentError?: (message: string) => void;
  /** Called when PDF.js has successfully opened the document. */
  onDocumentLoad?: (pageCount: number) => void;
  className?: string;
}

interface PageState {
  source: Blob | File;
  page: number;
}

interface SearchState {
  source: Blob | File | null;
  query: string;
  matchCount: number;
  matchIndex: number;
  searching: boolean;
  progress?: string;
}

interface SearchCounts {
  source: Blob | File | null;
  query: string;
  counts: Uint32Array | null;
}

function clampPage(page: number, total: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(Math.trunc(page), 1), Math.max(total, 1));
}

function countOccurrences(text: string, query: string): number {
  if (!query) return 0;
  let count = 0;
  let offset = 0;
  while (offset < text.length) {
    const index = text.indexOf(query, offset);
    if (index < 0) break;
    count += 1;
    offset = index + Math.max(1, query.length);
  }
  return count;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function PdfViewer({
  source,
  fileName,
  pageCount: suppliedPageCount = 0,
  initialPage = 1,
  onPageChange,
  onError,
  onDocumentError,
  onDocumentLoad,
  className,
}: PdfViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageInputRef = useRef<HTMLInputElement>(null);
  const onPageChangeRef = useRef(onPageChange);
  const onErrorRef = useRef(onError);
  const onDocumentErrorRef = useRef(onDocumentError);
  const onDocumentLoadRef = useRef(onDocumentLoad);
  const reportedErrorsRef = useRef(new Set<string>());
  onPageChangeRef.current = onPageChange;
  onErrorRef.current = onError;
  onDocumentErrorRef.current = onDocumentError;
  onDocumentLoadRef.current = onDocumentLoad;

  const reportError = (message: string) => {
    if (reportedErrorsRef.current.has(message)) return;
    reportedErrorsRef.current.add(message);
    onErrorRef.current?.(message);
  };

  const {
    document: pdfDocument,
    pageCount: loadedPageCount,
    loading,
    error,
    progress,
  } = usePdfDocument(source, {
    onError: (message) => {
      reportError(message);
      onDocumentErrorRef.current?.(message);
    },
    onLoad: (count) => onDocumentLoadRef.current?.(count),
  });

  useEffect(() => {
    if (!pdfDocument) return;
    return () => clearPdfPageCache(pdfDocument);
  }, [pdfDocument]);

  const totalPages = Math.max(
    1,
    loadedPageCount || Math.trunc(suppliedPageCount) || 1,
  );
  const [pageState, setPageState] = useState<PageState>({
    source,
    page: clampPage(initialPage, totalPages),
  });
  const currentPage = clampPage(
    pageState.source === source ? pageState.page : initialPage,
    totalPages,
  );
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const [mode, setMode] = useState<PdfViewMode>("single");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [zoom, setZoom] = useState(DEFAULT_DESKTOP_ZOOM);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const responsiveDefaultAppliedRef = useRef(false);
  const userAdjustedZoomRef = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(900);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollToPageRef = useRef<(page: number) => void>(() => undefined);

  const basePageWidth = Math.max(160, viewportWidth - 40);
  const renderedPageWidth = basePageWidth * zoom;
  const estimatedPageHeight = renderedPageWidth * 1.4142 + 32;

  // TanStack Virtual intentionally exposes a mutable virtualizer instance.
  // eslint-disable-next-line react-hooks/incompatible-library
  const pageVirtualizer = useVirtualizer({
    count: pdfDocument ? loadedPageCount : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimatedPageHeight,
    overscan: 2,
    getItemKey: (index) => index + 1,
  });

  scrollToPageRef.current = (page: number) => {
    if (modeRef.current === "scroll") {
      pageVirtualizer.scrollToIndex(page - 1, { align: "start" });
    } else {
      scrollRef.current?.scrollTo({ top: 0, left: 0 });
    }
  };

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const updateWidth = (width: number) => {
      if (width <= 0) return;
      setViewportWidth(Math.floor(width));
      if (!responsiveDefaultAppliedRef.current) {
        responsiveDefaultAppliedRef.current = true;
        if (
          !userAdjustedZoomRef.current &&
          !window.matchMedia(DESKTOP_MEDIA_QUERY).matches
        ) {
          setZoom(FIT_WIDTH_ZOOM);
        }
      }
    };

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) updateWidth(entry.contentRect.width);
      });
      observer.observe(node);
      return () => observer.disconnect();
    }

    const handleResize = () => updateWidth(node.getBoundingClientRect().width);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [pdfDocument, sidebarOpen]);

  useEffect(() => {
    if (mode !== "scroll") return;
    pageVirtualizer.measure();
  }, [basePageWidth, mode, pageVirtualizer, zoom]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(globalThis.document.fullscreenElement === rootRef.current);
    };
    globalThis.document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      globalThis.document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange,
      );
  }, []);

  useEffect(() => {
    reportedErrorsRef.current.clear();
  }, [source]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    [],
  );

  const [storedSearchState, setStoredSearchState] = useState<SearchState>({
    source,
    query: "",
    matchCount: 0,
    matchIndex: 0,
    searching: false,
  });
  const searchState: SearchState =
    storedSearchState.source === source
      ? storedSearchState
      : {
          source,
          query: "",
          matchCount: 0,
          matchIndex: 0,
          searching: false,
        };
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchCountsRef = useRef<SearchCounts>({
    source: null,
    query: "",
    counts: null,
  });

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    [pdfDocument],
  );

  const goToPage = (requestedPage: number, scroll = true) => {
    const nextPage = clampPage(requestedPage, totalPages);
    const changed = nextPage !== currentPageRef.current;
    currentPageRef.current = nextPage;
    setPageState({ source, page: nextPage });
    if (scroll) scrollToPageRef.current(nextPage);
    if (changed) onPageChangeRef.current?.(nextPage);
  };

  const handleScroll = () => {
    if (modeRef.current !== "scroll" || scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const container = scrollRef.current;
      if (!container || modeRef.current !== "scroll") return;

      const marker = container.scrollTop + container.clientHeight * 0.32;
      const items = pageVirtualizer.getVirtualItems();
      const active =
        items.find((item) => item.end > marker) ?? items[items.length - 1];
      if (!active) return;

      const page = active.index + 1;
      if (page === currentPageRef.current) return;
      currentPageRef.current = page;
      setPageState({ source, page });
      onPageChangeRef.current?.(page);
    });
  };

  const updateZoom = (nextZoom: number) => {
    userAdjustedZoomRef.current = true;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    setZoom(clamped);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (modeRef.current === "scroll") {
          scrollToPageRef.current(currentPageRef.current);
        }
      });
    });
  };

  const handleToggleMode = () => {
    const nextMode: PdfViewMode = mode === "single" ? "scroll" : "single";
    modeRef.current = nextMode;
    setMode(nextMode);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() =>
        scrollToPageRef.current(currentPageRef.current),
      );
    });
  };

  const handleToggleFullscreen = async () => {
    const root = rootRef.current;
    if (!root) return;
    try {
      if (globalThis.document.fullscreenElement === root) {
        await globalThis.document.exitFullscreen();
      } else if (root.requestFullscreen) {
        await root.requestFullscreen();
      } else {
        reportError("Таны хөтөч бүтэн дэлгэцийн горимыг дэмжихгүй байна.");
      }
    } catch {
      reportError("Бүтэн дэлгэцийн горимд шилжиж чадсангүй.");
    }
  };

  const handleDownload = () => {
    const objectUrl = URL.createObjectURL(source);
    const link = globalThis.document.createElement("a");
    link.href = objectUrl;
    link.download = fileName.trim() || "document.pdf";
    link.style.display = "none";
    globalThis.document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  };

  const handleSearchQueryChange = (query: string) => {
    searchAbortRef.current?.abort();
    searchCountsRef.current = { source, query: "", counts: null };
    setStoredSearchState({
      source,
      query,
      matchCount: 0,
      matchIndex: 0,
      searching: false,
    });
  };

  const handleSearch = () => {
    const visibleQuery = searchState.query.trim();
    if (!pdfDocument || !visibleQuery) {
      searchAbortRef.current?.abort();
      searchCountsRef.current = { source, query: "", counts: null };
      setStoredSearchState({
        source,
        query: searchState.query,
        matchCount: 0,
        matchIndex: 0,
        searching: false,
      });
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const normalizedQuery = normalizeSearchText(visibleQuery);
    const counts = new Uint32Array(loadedPageCount);
    searchCountsRef.current = { source, query: visibleQuery, counts };
    setStoredSearchState({
      source,
      query: searchState.query,
      matchCount: 0,
      matchIndex: 0,
      searching: true,
      progress: `Хайж байна… 0/${loadedPageCount}`,
    });

    void (async () => {
      let totalMatches = 0;
      let firstMatchFound = false;
      let extractionFailures = 0;

      for (let pageNumber = 1; pageNumber <= loadedPageCount; pageNumber += 1) {
        if (controller.signal.aborted) return;
        let pageMatchCount = 0;
        let page: PDFPageProxy | null = null;
        try {
          page = await pdfDocument.getPage(pageNumber);
          const textContent = await page.getTextContent();
          if (controller.signal.aborted) return;
          const pageText = normalizeSearchText(
            textContent.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
          pageMatchCount = countOccurrences(pageText, normalizedQuery);
        } catch {
          if (controller.signal.aborted) return;
          extractionFailures += 1;
        } finally {
          // A search can touch thousands of pages. Release decoded fonts,
          // images and operator-list resources as each page is completed.
          page?.cleanup();
        }

        counts[pageNumber - 1] = pageMatchCount;
        totalMatches += pageMatchCount;

        if (!firstMatchFound && pageMatchCount > 0) {
          firstMatchFound = true;
          goToPage(pageNumber);
        }

        if (
          pageMatchCount > 0 ||
          pageNumber % 8 === 0 ||
          pageNumber === loadedPageCount
        ) {
          setStoredSearchState((current) => {
            if (
              current.source !== source ||
              controller.signal.aborted ||
              current.query.trim() !== visibleQuery
            ) {
              return current;
            }
            return {
              ...current,
              matchCount: totalMatches,
              matchIndex:
                totalMatches > 0
                  ? Math.min(current.matchIndex, totalMatches - 1)
                  : 0,
              searching: pageNumber < loadedPageCount,
              progress:
                pageNumber < loadedPageCount
                  ? `Хайж байна… ${pageNumber}/${loadedPageCount}`
                  : totalMatches === 0
                    ? "Илэрц олдсонгүй"
                    : undefined,
            };
          });
        }

        if (pageNumber % 4 === 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }

      if (extractionFailures === loadedPageCount && !controller.signal.aborted) {
        reportError("PDF доторх текстийг хайж чадсангүй.");
      }
    })();
  };

  const moveSearchMatch = (direction: -1 | 1) => {
    const { counts, source: countsSource, query } = searchCountsRef.current;
    if (
      !counts ||
      countsSource !== source ||
      query !== searchState.query.trim() ||
      searchState.matchCount === 0
    ) {
      return;
    }

    const nextIndex =
      (searchState.matchIndex + direction + searchState.matchCount) %
      searchState.matchCount;
    let runningTotal = 0;
    let targetPage = 1;
    for (let index = 0; index < counts.length; index += 1) {
      runningTotal += counts[index];
      if (nextIndex < runningTotal) {
        targetPage = index + 1;
        break;
      }
    }

    setStoredSearchState((current) => ({ ...current, matchIndex: nextIndex }));
    goToPage(targetPage);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isTextEntryTarget(event.target)) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "g") {
      event.preventDefault();
      pageInputRef.current?.focus();
      pageInputRef.current?.select();
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      if (["+", "=", "Add"].includes(event.key)) {
        event.preventDefault();
        updateZoom(zoomRef.current + ZOOM_STEP);
      } else if (["-", "_", "Subtract"].includes(event.key)) {
        event.preventDefault();
        updateZoom(zoomRef.current - ZOOM_STEP);
      }
      return;
    }

    if (event.altKey || event.shiftKey) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToPage(currentPageRef.current - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goToPage(currentPageRef.current + 1);
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest("button, input, textarea, select, a")) return;
    rootRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={rootRef}
      data-pdf-viewer
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      className={clsx(
        "relative flex h-full min-h-[300px] w-full flex-col overflow-hidden bg-[var(--surface-muted)] text-[var(--text)] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] sm:min-h-[420px]",
        className,
      )}
      aria-label={`${fileName} PDF харагч`}
    >
      {pdfDocument && !error ? (
        <>
          <PdfToolbar
            currentPage={currentPage}
            totalPages={loadedPageCount}
            zoom={zoom}
            mode={mode}
            sidebarOpen={sidebarOpen}
            isFullscreen={isFullscreen}
            pageInputRef={pageInputRef}
            onPreviousPage={() => goToPage(currentPage - 1)}
            onNextPage={() => goToPage(currentPage + 1)}
            onPageChange={goToPage}
            onZoomOut={() => updateZoom(zoom - ZOOM_STEP)}
            onZoomIn={() => updateZoom(zoom + ZOOM_STEP)}
            onFitWidth={() => updateZoom(FIT_WIDTH_ZOOM)}
            onToggleSidebar={() => setSidebarOpen((open) => !open)}
            onToggleMode={handleToggleMode}
            onToggleFullscreen={() => void handleToggleFullscreen()}
            onDownload={handleDownload}
            searchQuery={searchState.query}
            searchMatchIndex={searchState.matchIndex}
            searchMatchCount={searchState.matchCount}
            isSearching={searchState.searching}
            searchProgress={searchState.progress}
            onSearchQueryChange={handleSearchQueryChange}
            onSearch={handleSearch}
            onPreviousMatch={() => moveSearchMatch(-1)}
            onNextMatch={() => moveSearchMatch(1)}
          />

          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            {sidebarOpen && (
              <>
                <button
                  type="button"
                  className="absolute inset-0 z-10 bg-black/25 md:hidden"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Хуудасны жагсаалт хаах"
                />
                <ThumbnailSidebar
                  document={pdfDocument}
                  pageCount={loadedPageCount}
                  currentPage={currentPage}
                  onPageSelect={(page) => {
                    goToPage(page);
                    if (!window.matchMedia("(min-width: 768px)").matches) {
                      setSidebarOpen(false);
                    }
                  }}
                  onError={reportError}
                  className="absolute inset-y-0 left-0 z-20 md:relative md:inset-auto"
                />
              </>
            )}

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-[color-mix(in_srgb,var(--background)_80%,var(--surface-muted))]"
              aria-label={
                mode === "single"
                  ? "Нэг хуудасны харагдац"
                  : "Босоо гүйлгэх харагдац"
              }
            >
              {mode === "single" ? (
                <div
                  className="flex min-h-full items-start justify-center p-5"
                  style={{ minWidth: renderedPageWidth + 40 }}
                >
                  <PdfPageCanvas
                    key={`${pdfDocument.fingerprints[0] ?? "pdf"}-${currentPage}`}
                    document={pdfDocument}
                    pageNumber={currentPage}
                    width={basePageWidth}
                    zoom={zoom}
                    mode="single"
                    onError={reportError}
                  />
                </div>
              ) : (
                <div
                  className="relative"
                  style={{
                    height: pageVirtualizer.getTotalSize(),
                    width: Math.max(viewportWidth, renderedPageWidth + 40),
                  }}
                >
                  {pageVirtualizer.getVirtualItems().map((virtualPage) => {
                    const pageNumber = virtualPage.index + 1;
                    return (
                      <div
                        key={virtualPage.key}
                        ref={pageVirtualizer.measureElement}
                        data-index={virtualPage.index}
                        className="absolute left-0 top-0 flex w-full justify-center py-4"
                        style={{
                          transform: `translateY(${virtualPage.start}px)`,
                        }}
                      >
                        <PdfPageCanvas
                          document={pdfDocument}
                          pageNumber={pageNumber}
                          width={basePageWidth}
                          zoom={zoom}
                          mode="scroll"
                          onError={reportError}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
            <FileWarning className="size-6" aria-hidden="true" />
          </div>
          <div>
            <p className="m-0 text-sm font-semibold">PDF нээхэд алдаа гарлаа</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{error}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <LoaderCircle
            className="size-7 animate-spin text-[var(--accent)]"
            aria-hidden="true"
          />
          <div>
            <p className="m-0 text-sm font-semibold">PDF уншиж байна...</p>
            <p className="mt-1 max-w-sm truncate text-xs text-[var(--text-muted)]">
              {fileName}
              {suppliedPageCount > 0 && ` · ${suppliedPageCount} хуудас`}
            </p>
          </div>
          {loading && typeof progress?.percent === "number" && (
            <div
              className="h-1.5 w-48 overflow-hidden rounded-full bg-[var(--border)]"
              role="progressbar"
              aria-valuenow={Math.round(progress.percent)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
