"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

import {
  normalizePdfError,
  openPdfDocument,
  type ManagedPdfDocument,
  type PdfLoadProgress,
} from "@/lib/pdf-engine";

export interface UsePdfDocumentOptions {
  onError?: (message: string) => void;
  onLoad?: (pageCount: number) => void;
}

export interface UsePdfDocumentResult {
  document: PDFDocumentProxy | null;
  pageCount: number;
  loading: boolean;
  error: string | null;
  progress: PdfLoadProgress | null;
}

interface PdfDocumentState {
  source: Blob | null;
  document: PDFDocumentProxy | null;
  pageCount: number;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  progress: PdfLoadProgress | null;
}

const INITIAL_STATE: PdfDocumentState = {
  source: null,
  document: null,
  pageCount: 0,
  status: "idle",
  error: null,
  progress: null,
};

export function usePdfDocument(
  source: Blob | File | null,
  options: UsePdfDocumentOptions = {},
): UsePdfDocumentResult {
  const [state, setState] = useState<PdfDocumentState>(INITIAL_STATE);
  const callbacksRef = useRef(options);

  useEffect(() => {
    callbacksRef.current = options;
  }, [options]);

  useEffect(() => {
    if (!source) return;

    const controller = new AbortController();
    let handle: ManagedPdfDocument | null = null;
    let active = true;

    void openPdfDocument(source, {
      signal: controller.signal,
      onProgress: (progress) => {
        if (!active) return;
        setState((current) => ({
          source,
          document: current.source === source ? current.document : null,
          pageCount: current.source === source ? current.pageCount : 0,
          status: "loading",
          error: null,
          progress,
        }));
      },
    })
      .then((opened) => {
        handle = opened;
        if (!active) {
          void opened.destroy();
          return;
        }

        setState({
          source,
          document: opened.document,
          pageCount: opened.document.numPages,
          status: "ready",
          error: null,
          progress: { loaded: source.size, total: source.size, percent: 100 },
        });
        callbacksRef.current.onLoad?.(opened.document.numPages);
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        const normalized = normalizePdfError(error);
        setState({
          source,
          document: null,
          pageCount: 0,
          status: "error",
          error: normalized.message,
          progress: null,
        });
        callbacksRef.current.onError?.(normalized.message);
      });

    return () => {
      active = false;
      controller.abort();
      if (handle) void handle.destroy();
    };
  }, [source]);

  if (!source) {
    return {
      document: null,
      pageCount: 0,
      loading: false,
      error: null,
      progress: null,
    };
  }

  if (state.source !== source) {
    return {
      document: null,
      pageCount: 0,
      loading: true,
      error: null,
      progress: null,
    };
  }

  return {
    document: state.document,
    pageCount: state.pageCount,
    loading: state.status === "loading",
    error: state.error,
    progress: state.progress,
  };
}
