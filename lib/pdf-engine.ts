import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
} from "pdfjs-dist";

export const PDF_ERROR_MESSAGES = {
  aborted: "PDF унших үйлдэл цуцлагдлаа.",
  invalid: "Энэ файл PDF биш эсвэл гэмтсэн байна.",
  password: "Файл нууц үгээр хамгаалагдсан байна.",
  tooLarge: "PDF файл хэт том байна.",
  unknown: "PDF файлыг нээж чадсангүй.",
} as const;

export type PdfErrorCode =
  | "aborted"
  | "invalid"
  | "password"
  | "too-large"
  | "unknown";

export class PdfEngineError extends Error {
  readonly code: PdfErrorCode;
  readonly cause?: unknown;

  constructor(code: PdfErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "PdfEngineError";
    this.code = code;
    this.cause = cause;
  }
}

type PdfJsModule = typeof import("pdfjs-dist");

let pdfJsPromise: Promise<PdfJsModule> | null = null;

// Keep decoded image surfaces bounded. PDF.js uses this value to resize very
// large embedded images in its worker instead of probing the browser's canvas
// limit at runtime, which is both slower and less predictable on low-memory
// devices.
const PDF_CANVAS_MAX_AREA_BYTES = 48 * 1024 * 1024;

/**
 * Loads PDF.js only in the browser. Keeping this import dynamic prevents its
 * DOM-specific entry point from being evaluated by the Next.js server runtime.
 */
export function loadPdfJs(): Promise<PdfJsModule> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new PdfEngineError(
        "unknown",
        "PDF файлыг зөвхөн хөтөч дээр нээх боломжтой.",
      ),
    );
  }

  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist")
      .then((pdfjs) => {
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url,
          ).toString();
        }
        return pdfjs;
      })
      .catch((error: unknown) => {
        pdfJsPromise = null;
        throw error;
      });
  }

  return pdfJsPromise;
}

export interface PdfLoadProgress {
  loaded: number;
  total?: number;
  percent?: number;
}

export interface OpenPdfDocumentOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PdfLoadProgress) => void;
}

export interface ManagedPdfDocument {
  readonly document: PDFDocumentProxy;
  readonly loadingTask: PDFDocumentLoadingTask;
  /** Present only when this loader created a temporary URL for a Blob/File. */
  readonly objectUrl: string | null;
  destroy: () => Promise<void>;
}

/** Local files and remote cloud URLs supported by the shared PDF viewer. */
export type PdfSource = Blob | File | string;

function abortError(): DOMException | Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("PDF loading aborted", "AbortError");
  }
  const error = new Error("PDF loading aborted");
  error.name = "AbortError";
  return error;
}

function validateSource(source: PdfSource): void {
  if (typeof source === "string") {
    if (!source.trim()) {
      throw new PdfEngineError("invalid", PDF_ERROR_MESSAGES.invalid);
    }
    return;
  }

  if (!(source instanceof Blob) || source.size === 0) {
    throw new PdfEngineError("invalid", PDF_ERROR_MESSAGES.invalid);
  }
}

function normalizeRemoteSource(source: string): string {
  try {
    const url = new URL(source, window.location.href);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Unsupported PDF URL protocol");
    }
    return url.toString();
  } catch (error) {
    throw new PdfEngineError("invalid", PDF_ERROR_MESSAGES.invalid, error);
  }
}

/** Convert PDF.js/browser exceptions to stable Mongolian user-facing errors. */
export function normalizePdfError(error: unknown): PdfEngineError {
  if (error instanceof PdfEngineError) {
    return error;
  }

  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : "";
  const rawMessage =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error ?? "");
  const message = rawMessage.toLowerCase();

  if (name === "AbortError" || message.includes("loading aborted")) {
    return new PdfEngineError("aborted", PDF_ERROR_MESSAGES.aborted, error);
  }

  if (name === "PasswordException" || message.includes("password")) {
    return new PdfEngineError("password", PDF_ERROR_MESSAGES.password, error);
  }

  if (
    name === "InvalidPDFException" ||
    name === "FormatError" ||
    name === "MissingPDFException" ||
    message.includes("invalid pdf") ||
    message.includes("missing pdf")
  ) {
    return new PdfEngineError("invalid", PDF_ERROR_MESSAGES.invalid, error);
  }

  if (
    name === "RangeError" ||
    message.includes("out of memory") ||
    message.includes("allocation failed") ||
    message.includes("too large")
  ) {
    return new PdfEngineError("too-large", PDF_ERROR_MESSAGES.tooLarge, error);
  }

  return new PdfEngineError("unknown", PDF_ERROR_MESSAGES.unknown, error);
}

export function getPdfErrorMessage(error: unknown): string {
  return normalizePdfError(error).message;
}

/**
 * Opens a local Blob/File or remote URL and owns every disposable resource it
 * creates. The caller must call `destroy`; aborting before resolution performs
 * the same cleanup automatically.
 */
export async function openPdfDocument(
  source: PdfSource,
  options: OpenPdfDocumentOptions = {},
): Promise<ManagedPdfDocument> {
  validateSource(source);

  if (options.signal?.aborted) {
    throw abortError();
  }

  const pdfjs = await loadPdfJs();
  if (options.signal?.aborted) {
    throw abortError();
  }

  const objectUrl = typeof source === "string" ? null : URL.createObjectURL(source);
  const sourceUrl = objectUrl ?? normalizeRemoteSource(source as string);
  let loadingTask: PDFDocumentLoadingTask;
  try {
    loadingTask = pdfjs.getDocument({
      url: sourceUrl,
      useSystemFonts: true,
      canvasMaxAreaInBytes: PDF_CANVAS_MAX_AREA_BYTES,
      // Blob URLs support range requests in modern browsers. Avoid eagerly
      // pulling every byte into PDF.js for multi-thousand-page local files;
      // browsers without range support still fall back to a full request.
      disableAutoFetch: true,
      disableStream: true,
    });
  } catch (error) {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    throw normalizePdfError(error);
  }

  let destroyed = false;
  const destroy = async (): Promise<void> => {
    if (destroyed) return;
    destroyed = true;
    try {
      await loadingTask.destroy();
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  };

  loadingTask.onProgress = ({
    loaded,
    total,
    percent,
  }: {
    loaded: number;
    total?: number;
    percent?: number;
  }) => {
    options.onProgress?.({
      loaded,
      total: total && total > 0 ? total : undefined,
      percent: typeof percent === "number" && Number.isFinite(percent)
        ? Math.min(100, Math.max(0, percent))
        : total && total > 0
          ? Math.min(100, Math.max(0, (loaded / total) * 100))
          : undefined,
    });
  };

  const handleAbort = () => {
    void destroy();
  };
  options.signal?.addEventListener("abort", handleAbort, { once: true });

  try {
    const document = await loadingTask.promise;
    if (options.signal?.aborted) {
      await destroy();
      throw abortError();
    }

    options.signal?.removeEventListener("abort", handleAbort);
    return { document, loadingTask, objectUrl, destroy };
  } catch (error) {
    options.signal?.removeEventListener("abort", handleAbort);
    await destroy().catch(() => undefined);
    if (options.signal?.aborted) {
      throw abortError();
    }
    throw normalizePdfError(error);
  }
}

/** Open, validate and count a PDF without retaining its document or Blob URL. */
export async function inspectPdfFile(
  file: Blob,
  options: OpenPdfDocumentOptions = {},
): Promise<{ pageCount: number }> {
  const handle = await openPdfDocument(file, options);
  try {
    return { pageCount: handle.document.numPages };
  } finally {
    await handle.destroy();
  }
}
