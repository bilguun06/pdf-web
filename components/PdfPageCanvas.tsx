"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

export type PdfPageCanvasMode = "single" | "scroll" | "thumbnail";

export interface PdfPageCanvasProps {
  document: PDFDocumentProxy;
  pageNumber: number;
  /** Available page width at 100% zoom, in CSS pixels. */
  width: number;
  zoom?: number;
  thumbnail?: boolean;
  mode?: PdfPageCanvasMode;
  className?: string;
  onError?: (message: string) => void;
}

interface PageDimensions {
  width: number;
  height: number;
}

interface PageRenderState {
  document: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  zoom: number;
  thumbnail: boolean;
  mode: PdfPageCanvasMode;
  dimensions: PageDimensions | null;
  status: "loading" | "ready" | "error";
}

interface CachedPageBitmap {
  bitmap: ImageBitmap;
  cssWidth: number;
  cssHeight: number;
  bytes: number;
}

const MAX_CACHED_BITMAP_BYTES = 64 * 1024 * 1024;
const MAX_CACHED_BITMAPS = 32;
const documentCacheIds = new WeakMap<PDFDocumentProxy, number>();
const retiredDocuments = new WeakSet<PDFDocumentProxy>();
const pageBitmapCache = new Map<string, CachedPageBitmap>();
let nextDocumentCacheId = 1;
let cachedBitmapBytes = 0;

function getDocumentCacheId(document: PDFDocumentProxy): number {
  const existingId = documentCacheIds.get(document);
  if (existingId !== undefined) return existingId;

  const id = nextDocumentCacheId;
  nextDocumentCacheId += 1;
  documentCacheIds.set(document, id);
  return id;
}

function activateDocumentCache(document: PDFDocumentProxy): number {
  const documentId = getDocumentCacheId(document);
  retiredDocuments.delete(document);
  return documentId;
}

function closeBitmap(bitmap: ImageBitmap) {
  try {
    bitmap.close();
  } catch {
    // Closing is best-effort for browser implementations that already released it.
  }
}

function removeCachedBitmap(key: string) {
  const entry = pageBitmapCache.get(key);
  if (!entry) return;

  pageBitmapCache.delete(key);
  cachedBitmapBytes -= entry.bytes;
  closeBitmap(entry.bitmap);
}

export function clearPdfPageCache(document: PDFDocumentProxy) {
  const documentId = getDocumentCacheId(document);
  retiredDocuments.add(document);
  const keyPrefix = `${documentId}:`;

  for (const key of pageBitmapCache.keys()) {
    if (key.startsWith(keyPrefix)) removeCachedBitmap(key);
  }
}

function getCachedBitmap(key: string): CachedPageBitmap | undefined {
  const entry = pageBitmapCache.get(key);
  if (!entry) return undefined;

  // Map insertion order doubles as the LRU queue.
  pageBitmapCache.delete(key);
  pageBitmapCache.set(key, entry);
  return entry;
}

function cacheBitmap(
  key: string,
  bitmap: ImageBitmap,
  cssWidth: number,
  cssHeight: number,
) {
  const bytes = bitmap.width * bitmap.height * 4;
  if (bytes <= 0 || bytes > MAX_CACHED_BITMAP_BYTES) {
    closeBitmap(bitmap);
    return;
  }

  removeCachedBitmap(key);
  pageBitmapCache.set(key, { bitmap, cssWidth, cssHeight, bytes });
  cachedBitmapBytes += bytes;

  while (
    pageBitmapCache.size > MAX_CACHED_BITMAPS ||
    cachedBitmapBytes > MAX_CACHED_BITMAP_BYTES
  ) {
    const oldestKey = pageBitmapCache.keys().next().value;
    if (oldestKey === undefined) break;
    removeCachedBitmap(oldestKey);
  }
}

function isCancelledRender(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }
  return (
    String(error.name) === "RenderingCancelledException" ||
    String(error.name) === "AbortException"
  );
}

export function PdfPageCanvas({
  document,
  pageNumber,
  width,
  zoom = 1,
  thumbnail = false,
  mode = "single",
  className,
  onError,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onErrorRef = useRef(onError);
  const safeWidth = Math.max(1, width);
  const safeZoom = Math.max(0.1, zoom);
  const resolvedMode: PdfPageCanvasMode = thumbnail ? "thumbnail" : mode;
  const [renderState, setRenderState] = useState<PageRenderState>({
    document,
    pageNumber,
    width: safeWidth,
    zoom: safeZoom,
    thumbnail,
    mode: resolvedMode,
    dimensions: null,
    status: "loading",
  });

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const stateMatches =
    renderState.document === document &&
    renderState.pageNumber === pageNumber &&
    renderState.width === safeWidth &&
    renderState.zoom === safeZoom &&
    renderState.thumbnail === thumbnail &&
    renderState.mode === resolvedMode;
  const status = stateMatches ? renderState.status : "loading";
  const dimensions = stateMatches ? renderState.dimensions : null;
  const placeholderWidth = safeWidth * safeZoom;
  const placeholderHeight = placeholderWidth * 1.4142;
  const visibleDimensions = dimensions ?? {
    width: placeholderWidth,
    height: placeholderHeight,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;

    let active = true;
    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;
    const desiredPixelRatio = thumbnail
      ? Math.min(window.devicePixelRatio || 1, 1.25)
      : Math.min(window.devicePixelRatio || 1, 2);
    const documentCacheId = activateDocumentCache(document);
    const cacheKey = [
      documentCacheId,
      pageNumber,
      safeWidth.toFixed(3),
      safeZoom.toFixed(4),
      resolvedMode,
      desiredPixelRatio.toFixed(3),
    ].join(":");

    const renderPage = async () => {
      try {
        const cached = getCachedBitmap(cacheKey);
        if (cached) {
          try {
            canvas.width = cached.bitmap.width;
            canvas.height = cached.bitmap.height;
            canvas.style.width = `${cached.cssWidth}px`;
            canvas.style.height = `${cached.cssHeight}px`;

            const context = canvas.getContext("2d", { alpha: false });
            if (!context) throw new Error("Canvas context unavailable");
            context.drawImage(cached.bitmap, 0, 0);

            if (!active) return;
            setRenderState({
              document,
              pageNumber,
              width: safeWidth,
              zoom: safeZoom,
              thumbnail,
              mode: resolvedMode,
              dimensions: {
                width: cached.cssWidth,
                height: cached.cssHeight,
              },
              status: "ready",
            });
            return;
          } catch {
            removeCachedBitmap(cacheKey);
            canvas.width = 0;
            canvas.height = 0;
            canvas.removeAttribute("style");
          }
        }

        page = await document.getPage(pageNumber);
        if (!active) {
          page.cleanup();
          return;
        }

        const naturalViewport = page.getViewport({ scale: 1 });
        const cssScale = (safeWidth / naturalViewport.width) * safeZoom;
        const viewport = page.getViewport({ scale: cssScale });
        const cssWidth = Math.max(1, viewport.width);
        const cssHeight = Math.max(1, viewport.height);

        setRenderState({
          document,
          pageNumber,
          width: safeWidth,
          zoom: safeZoom,
          thumbnail,
          mode: resolvedMode,
          dimensions: { width: cssWidth, height: cssHeight },
          status: "loading",
        });

        // Scroll mode may keep several virtualized pages mounted at once, so
        // give it a lower per-canvas budget than the single-page view.
        const pixelBudget = thumbnail
          ? 2_000_000
          : resolvedMode === "scroll"
            ? 10_000_000
            : 14_000_000;
        const desiredPixels =
          cssWidth * cssHeight * desiredPixelRatio * desiredPixelRatio;
        const budgetScale =
          desiredPixels > pixelBudget
            ? Math.sqrt(pixelBudget / desiredPixels)
            : 1;
        const outputScale = Math.max(
          0.25,
          desiredPixelRatio * budgetScale,
        );

        canvas.width = Math.max(1, Math.floor(cssWidth * outputScale));
        canvas.height = Math.max(1, Math.floor(cssHeight * outputScale));
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        renderTask = page.render({
          canvas,
          viewport,
          background: "#ffffff",
          transform:
            outputScale === 1
              ? undefined
              : [outputScale, 0, 0, outputScale, 0, 0],
        });
        await renderTask.promise;

        if (!active) return;

        setRenderState({
          document,
          pageNumber,
          width: safeWidth,
          zoom: safeZoom,
          thumbnail,
          mode: resolvedMode,
          dimensions: { width: cssWidth, height: cssHeight },
          status: "ready",
        });

        if (typeof window.createImageBitmap === "function") {
          try {
            void window
              .createImageBitmap(canvas)
              .then((bitmap) => {
                if (
                  !active ||
                  retiredDocuments.has(document)
                ) {
                  closeBitmap(bitmap);
                  return;
                }
                cacheBitmap(cacheKey, bitmap, cssWidth, cssHeight);
              })
              .catch(() => undefined);
          } catch {
            // The rendered canvas remains usable when bitmap snapshots are unsupported.
          }
        }
      } catch (error) {
        if (!active || isCancelledRender(error)) return;
        setRenderState({
          document,
          pageNumber,
          width: safeWidth,
          zoom: safeZoom,
          thumbnail,
          mode: resolvedMode,
          dimensions: null,
          status: "error",
        });
        onErrorRef.current?.(
          `PDF-ийн ${pageNumber}-р хуудсыг харуулж чадсангүй.`,
        );
      } finally {
        if (!active) page?.cleanup();
      }
    };

    void renderPage();

    return () => {
      active = false;
      renderTask?.cancel();
      page?.cleanup();
      canvas.width = 0;
      canvas.height = 0;
      canvas.removeAttribute("style");
    };
  }, [
    document,
    pageNumber,
    resolvedMode,
    safeWidth,
    safeZoom,
    thumbnail,
    width,
  ]);

  return (
    <div
      className={clsx(
        "relative shrink-0 overflow-hidden bg-white shadow-[0_2px_14px_rgb(15_23_42/0.16)]",
        thumbnail ? "rounded-sm" : "rounded-[3px]",
        className,
      )}
      style={{
        width: visibleDimensions.width,
        height: visibleDimensions.height,
      }}
      aria-label={`${pageNumber}-р хуудас`}
      aria-busy={status === "loading"}
    >
      <canvas
        ref={canvasRef}
        className={clsx(
          "block max-w-none transition-opacity duration-150",
          status === "ready" ? "opacity-100" : "opacity-0",
        )}
      />

      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-white text-slate-400">
          <LoaderCircle
            className={clsx(
              "animate-spin",
              thumbnail ? "size-4" : "size-6",
            )}
            aria-hidden="true"
          />
          <span className="sr-only">Хуудсыг харуулж байна...</span>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white p-3 text-center text-xs text-slate-500">
          <TriangleAlert className="size-5 text-amber-600" aria-hidden="true" />
          {!thumbnail && <span>Хуудсыг харуулж чадсангүй.</span>}
        </div>
      )}
    </div>
  );
}
