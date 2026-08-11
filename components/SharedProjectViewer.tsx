"use client";

import {
  AlertTriangle,
  CalendarDays,
  Eye,
  FileQuestion,
  FileText,
  Files,
  HardDrive,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { GroupTabs } from "@/components/GroupTabs";
import { PdfViewer } from "@/components/PdfViewer";
import { Button } from "@/components/ui/Button";
import { formatFileSize } from "@/lib/file";

interface SharedPdf {
  id: string;
  originalName: string;
  blobUrl: string;
  pageCount: number;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
}

interface SharedGroup {
  id: string;
  name: string;
  sortOrder: number;
  note: string | null;
  pdf: SharedPdf | null;
}

interface SharedProject {
  shareId: string;
  name: string;
  updatedAt: string;
  groups: SharedGroup[];
}

type LoadState =
  | { requestKey: string; status: "loading" }
  | { requestKey: string; status: "ready"; project: SharedProject }
  | { requestKey: string; status: "not-found" }
  | { requestKey: string; status: "error"; message: string };

export interface SharedProjectViewerProps {
  shareId: string;
}

class SharedProjectResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SharedProjectResponseError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  label: string,
  maxLength = 2_000,
): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new SharedProjectResponseError(`${label} буруу байна.`);
  }
  return value;
}

function nullableString(
  value: unknown,
  label: string,
  maxLength = 5_000,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new SharedProjectResponseError(`${label} буруу байна.`);
  }
  return value;
}

function integer(
  value: unknown,
  label: string,
  minimum = 0,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum
  ) {
    throw new SharedProjectResponseError(`${label} буруу байна.`);
  }
  return value;
}

function pdfUrl(value: unknown): string {
  const raw = requiredString(value, "PDF холбоос", 8_000);
  try {
    const url = new URL(raw, window.location.origin);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Unsupported URL protocol");
    }
    return url.toString();
  } catch (error) {
    throw new SharedProjectResponseError(
      error instanceof Error && error.message === "Unsupported URL protocol"
        ? "PDF холбоосын төрөл дэмжигдэхгүй байна."
        : "PDF холбоос буруу байна.",
    );
  }
}

function parsePdf(value: unknown): SharedPdf | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    throw new SharedProjectResponseError("PDF мэдээлэл буруу байна.");
  }

  return {
    id: requiredString(value.id, "PDF ID", 300),
    originalName: requiredString(value.originalName, "PDF нэр"),
    blobUrl: pdfUrl(value.blobUrl),
    pageCount: integer(value.pageCount, "PDF хуудасны тоо", 1),
    fileSize: integer(value.fileSize, "PDF файлын хэмжээ"),
    createdAt: requiredString(value.createdAt, "PDF үүсгэсэн огноо", 100),
    updatedAt: requiredString(value.updatedAt, "PDF шинэчилсэн огноо", 100),
  };
}

function parseProjectResponse(value: unknown): SharedProject {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.project)) {
    throw new SharedProjectResponseError("Төслийн мэдээлэл буруу байна.");
  }

  const raw = value.data.project;
  if (!Array.isArray(raw.groups)) {
    throw new SharedProjectResponseError("Төслийн бүлгүүд буруу байна.");
  }

  const ids = new Set<string>();
  const groups = raw.groups.map((value, index): SharedGroup => {
    if (!isRecord(value)) {
      throw new SharedProjectResponseError(
        `${index + 1}-р бүлгийн мэдээлэл буруу байна.`,
      );
    }
    const id = requiredString(value.id, "Бүлгийн ID", 300);
    if (ids.has(id)) {
      throw new SharedProjectResponseError("Бүлгийн ID давхардсан байна.");
    }
    ids.add(id);
    return {
      id,
      name: requiredString(value.name, "Бүлгийн нэр", 200),
      sortOrder: integer(value.sortOrder, "Бүлгийн дараалал"),
      note: nullableString(value.note, "Бүлгийн тэмдэглэл"),
      pdf: parsePdf(value.pdf),
    };
  });

  groups.sort((left, right) => left.sortOrder - right.sortOrder);

  return {
    shareId: requiredString(raw.shareId, "Share ID", 300),
    name: requiredString(raw.name, "Төслийн нэр", 200),
    updatedAt: requiredString(raw.updatedAt, "Төсөл шинэчилсэн огноо", 100),
    groups,
  };
}

function apiErrorMessage(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  const message = value.error.message;
  return typeof message === "string" && message.trim() && message.length <= 1_000
    ? message
    : null;
}

function formatUpdatedAt(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function ProjectLoadingState() {
  return (
    <main
      className="grid h-dvh min-w-[320px] place-items-center bg-[var(--background)] p-6 text-[var(--text)]"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <LoaderCircle
          aria-hidden="true"
          className="size-8 animate-spin text-[var(--accent)]"
        />
        <div>
          <p className="text-sm font-bold">Төслийг ачаалж байна...</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Хуваалцсан мэдээллийг бэлтгэж байна.
          </p>
        </div>
      </div>
    </main>
  );
}

function ProjectNotFoundState() {
  return (
    <main className="grid h-dvh min-w-[320px] place-items-center overflow-auto bg-[var(--background)] p-5 text-[var(--text)] sm:p-8">
      <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-7 text-center shadow-[var(--shadow)] sm:p-9">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <FileQuestion aria-hidden="true" className="size-7" />
        </div>
        <h1 className="text-xl font-extrabold">Төсөл олдсонгүй</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          Холбоос буруу эсвэл төсөл устгагдсан байна.
        </p>
        <Link
          href="/"
          className="mx-auto mt-6 inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--text)] outline-none transition hover:bg-[var(--surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          Нүүр хуудас руу буцах
        </Link>
      </section>
    </main>
  );
}

function ProjectErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="grid h-dvh min-w-[320px] place-items-center overflow-auto bg-[var(--background)] p-5 text-[var(--text)] sm:p-8">
      <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-7 text-center shadow-[var(--shadow)] sm:p-9">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
          <AlertTriangle aria-hidden="true" className="size-7" />
        </div>
        <h1 className="text-xl font-extrabold">Төслийг ачаалж чадсангүй</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{message}</p>
        <Button className="mx-auto mt-6" onClick={onRetry}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Дахин оролдох
        </Button>
      </section>
    </main>
  );
}

function EmptyProjectState() {
  return (
    <main className="grid min-h-0 flex-1 place-items-center overflow-auto p-5 sm:p-8">
      <section className="w-full max-w-lg rounded-3xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-8 text-center">
        <Files aria-hidden="true" className="mx-auto size-9 text-[var(--text-muted)]" />
        <h2 className="mt-4 text-base font-extrabold">Энэ төсөлд бүлэг алга</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Төсөл эзэмшигч бүлэг нэмсний дараа энд харагдана.
        </p>
      </section>
    </main>
  );
}

function EmptyPdfState({ groupName }: { groupName: string }) {
  return (
    <div className="grid h-full min-h-[300px] place-items-center overflow-auto p-6 text-center sm:min-h-[420px]">
      <div>
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--surface)] text-[var(--text-muted)] shadow-sm">
          <FileText aria-hidden="true" className="size-6" />
        </div>
        <h2 className="mt-4 text-sm font-extrabold">PDF оруулаагүй байна</h2>
        <p className="mt-1 max-w-sm text-sm leading-6 text-[var(--text-muted)]">
          “{groupName}” бүлэгт одоогоор PDF файл байхгүй байна.
        </p>
      </div>
    </div>
  );
}

function SharedWorkspace({ project }: { project: SharedProject }) {
  const [selection, setSelection] = useState({
    shareId: project.shareId,
    groupId: project.groups[0]?.id ?? null,
  });
  const selectedGroupId =
    selection.shareId === project.shareId
      ? selection.groupId
      : project.groups[0]?.id ?? null;

  const selectedGroup =
    project.groups.find((group) => group.id === selectedGroupId) ??
    project.groups[0] ??
    null;
  const updatedAt = formatUpdatedAt(project.updatedAt);
  const groupCards = useMemo(
    () =>
      project.groups.map((group) => ({
        id: group.id,
        name: group.name,
        fileName: group.pdf?.originalName,
        pageCount: group.pdf?.pageCount ?? 0,
        status: group.pdf ? ("ready" as const) : ("empty" as const),
      })),
    [project.groups],
  );

  return (
    <div className="flex h-dvh min-w-[320px] flex-col overflow-hidden bg-[var(--background)] text-[var(--text)]">
      <header className="relative z-40 flex min-h-16 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 sm:px-5 lg:px-6">
        <div
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-white shadow-sm"
          role="img"
          aria-label="PDF Group Manager"
        >
          <Files aria-hidden="true" className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-extrabold sm:text-base" title={project.name}>
            {project.name}
          </h1>
          {updatedAt ? (
            <p className="mt-0.5 hidden items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] sm:flex">
              <CalendarDays aria-hidden="true" className="size-3" />
              {updatedAt} шинэчилсэн
            </p>
          ) : null}
        </div>
        <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-2.5 py-1.5 text-[10px] font-extrabold text-[var(--accent)] sm:px-3 sm:text-xs">
          <Eye aria-hidden="true" className="size-3.5" />
          <span>Зөвхөн үзэх горим</span>
        </div>
      </header>

      {project.groups.length > 0 ? (
        <GroupTabs
          groups={groupCards}
          selectedGroupId={selectedGroup?.id}
          onSelectGroup={(groupId) =>
            setSelection({ shareId: project.shareId, groupId })
          }
          readOnly
        />
      ) : null}

      {selectedGroup ? (
        <main className="flex min-h-0 flex-1 flex-col">
          <section className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-2 sm:px-5 sm:pb-5 sm:pt-3 lg:px-6">
            <div className="mb-2 shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-sm sm:mb-3 sm:px-4 sm:py-3">
              <div className="flex items-center gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] sm:size-10">
                  <FileText aria-hidden="true" className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2
                    className="truncate text-sm font-extrabold sm:text-base"
                    title={selectedGroup.name}
                  >
                    {selectedGroup.name}
                  </h2>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-[var(--text-muted)] sm:text-xs">
                    <span
                      className="max-w-[55vw] truncate sm:max-w-72"
                      title={selectedGroup.pdf?.originalName}
                    >
                      {selectedGroup.pdf?.originalName ?? "PDF оруулаагүй"}
                    </span>
                    {selectedGroup.pdf ? (
                      <>
                        <span>
                          {selectedGroup.pdf.pageCount.toLocaleString("mn-MN")} хуудас
                        </span>
                        <span className="hidden items-center gap-1 sm:inline-flex">
                          <HardDrive aria-hidden="true" className="size-3" />
                          {formatFileSize(selectedGroup.pdf.fileSize)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                {selectedGroup.note?.trim() ? (
                  <aside
                    aria-label="Бүлгийн тэмдэглэл"
                    className="hidden min-w-0 max-w-sm items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--text-muted)] lg:flex"
                    title={selectedGroup.note}
                  >
                    <MessageSquareText aria-hidden="true" className="size-4 shrink-0" />
                    <span className="truncate">{selectedGroup.note}</span>
                  </aside>
                ) : null}
              </div>
              {selectedGroup.note?.trim() ? (
                <aside
                  aria-label="Бүлгийн тэмдэглэл"
                  className="mt-2 flex max-h-20 items-start gap-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--text-muted)] lg:hidden"
                >
                  <MessageSquareText aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 whitespace-pre-wrap break-words">
                    {selectedGroup.note}
                  </span>
                </aside>
              ) : null}
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] shadow-[var(--shadow)]">
              {selectedGroup.pdf ? (
                <PdfViewer
                  key={`${selectedGroup.id}:${selectedGroup.pdf.id}:${selectedGroup.pdf.updatedAt}`}
                  source={selectedGroup.pdf.blobUrl}
                  fileName={selectedGroup.pdf.originalName}
                  pageCount={selectedGroup.pdf.pageCount}
                  initialPage={1}
                  initialSidebarOpen={false}
                  className="h-full"
                />
              ) : (
                <EmptyPdfState groupName={selectedGroup.name} />
              )}
            </div>
          </section>
        </main>
      ) : (
        <EmptyProjectState />
      )}
    </div>
  );
}

export function SharedProjectViewer({ shareId }: SharedProjectViewerProps) {
  const [retryKey, setRetryKey] = useState(0);
  const requestKey = `${shareId}:${retryKey}`;
  const [state, setState] = useState<LoadState>({
    requestKey,
    status: "loading",
  });
  const visibleState: LoadState =
    state.requestKey === requestKey
      ? state
      : { requestKey, status: "loading" };

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch(`/api/share/${encodeURIComponent(shareId)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as unknown;
        if (controller.signal.aborted) return;

        if (response.status === 404) {
          setState({ requestKey, status: "not-found" });
          return;
        }
        if (!response.ok) {
          throw new SharedProjectResponseError(
            apiErrorMessage(payload) ??
              "Сервертэй холбогдоход алдаа гарлаа. Түр хүлээгээд дахин оролдоно уу.",
          );
        }

        const project = parseProjectResponse(payload);
        if (project.shareId !== shareId) {
          throw new SharedProjectResponseError("Төслийн мэдээлэл зөрүүтэй байна.");
        }
        setState({
          requestKey,
          status: "ready",
          project,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          requestKey,
          status: "error",
          message:
            error instanceof SharedProjectResponseError
              ? error.message
              : "Сервертэй холбогдож чадсангүй. Интернэт холболтоо шалгаад дахин оролдоно уу.",
        });
      }
    })();

    return () => controller.abort();
  }, [requestKey, shareId]);

  if (visibleState.status === "loading") return <ProjectLoadingState />;
  if (visibleState.status === "not-found") return <ProjectNotFoundState />;
  if (visibleState.status === "error") {
    return (
      <ProjectErrorState
        message={visibleState.message}
        onRetry={() => setRetryKey((current) => current + 1)}
      />
    );
  }
  return <SharedWorkspace project={visibleState.project} />;
}
