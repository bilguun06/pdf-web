"use client";

import {
  CalendarDays,
  FileText,
  HardDrive,
  LoaderCircle,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { toast, Toaster } from "sonner";

import {
  ConfirmDeleteDialog,
  ConfirmDialog,
  CreateGroupsDialog,
  CreateProjectDialog,
  RenameGroupDialog,
} from "@/components/dialogs";
import { EmptyState } from "@/components/EmptyState";
import { GroupTabs } from "@/components/GroupTabs";
import { Header } from "@/components/Header";
import { PdfDropZone } from "@/components/PdfDropZone";
import { PdfViewer } from "@/components/PdfViewer";
import { CloudShareDialog } from "@/components/cloud/CloudShareDialog";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useCloudMigration } from "@/hooks/useCloudProject";
import { useProject } from "@/hooks/useProject";
import {
  formatFileSize,
  validatePdfFile,
  validateProjectFile,
} from "@/lib/file";
import { getPdfErrorMessage, inspectPdfFile } from "@/lib/pdf-engine";
import type { PdfGroup } from "@/types/project";

function getMessage(reason: unknown, fallback: string) {
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === "object" && reason && "message" in reason) {
    return String(reason.message);
  }
  return fallback;
}

function isProjectManagerError(reason: unknown): reason is Error {
  return reason instanceof Error && reason.name === "ProjectManagerError";
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Огноо тодорхойгүй";
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function focusGroupTab(groupId?: string) {
  window.requestAnimationFrame(() => {
    const tabs = document.querySelectorAll<HTMLButtonElement>("[data-group-tab]");
    const target = groupId
      ? Array.from(tabs).find((tab) => tab.dataset.groupTab === groupId)
      : Array.from(tabs).find((tab) => tab.getAttribute("aria-selected") === "true");
    target?.focus({ preventScroll: true });
  });
}

function WorkspaceSkeleton() {
  return (
    <div className="flex h-dvh flex-col bg-[var(--background)]" aria-label="Төсөл ачаалж байна">
      <div className="h-16 border-b border-[var(--border)] bg-[var(--surface)]" />
      <div className="flex h-40 gap-3 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-muted)] p-5">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-28 w-60 shrink-0 animate-pulse rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
          />
        ))}
      </div>
      <div className="grid flex-1 place-items-center">
        <div className="flex items-center gap-3 text-sm font-semibold text-[var(--text-muted)]">
          <LoaderCircle className="size-5 animate-spin text-[var(--accent)]" />
          Local төслийг сэргээж байна…
        </div>
      </div>
    </div>
  );
}

function PdfViewerSkeleton() {
  return (
    <div
      className="flex h-full min-h-[320px] flex-col overflow-hidden bg-[var(--surface-muted)]"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">PDF файлыг сэргээж байна…</span>

      <div
        className="flex h-12 shrink-0 animate-pulse items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3"
        aria-hidden="true"
      >
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-lg bg-[var(--border)]" />
          <div className="h-7 w-20 rounded-lg bg-[var(--border)] sm:w-28" />
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden h-7 w-20 rounded-lg bg-[var(--border)] sm:block" />
          <div className="h-7 w-14 rounded-lg bg-[var(--border)]" />
          <div className="size-7 rounded-lg bg-[var(--border)]" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden" aria-hidden="true">
        <div className="hidden w-36 shrink-0 animate-pulse flex-col gap-3 overflow-hidden border-r border-[var(--border)] bg-[var(--surface)] p-3 md:flex">
          {[0, 1, 2].map((item) => (
            <div key={item} className="space-y-2">
              <div className="mx-auto aspect-[3/4] w-20 rounded bg-[var(--border)]" />
              <div className="mx-auto h-2 w-8 rounded-full bg-[var(--border)]" />
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 items-start justify-center overflow-hidden p-4 sm:p-6">
          <div
            className="w-[min(88%,440px)] max-w-full animate-pulse rounded-sm border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]"
            style={{ aspectRatio: "1 / 1.4142" }}
          >
            <div className="h-3 w-2/5 rounded-full bg-[var(--border)]" />
            <div className="mt-8 space-y-3">
              <div className="h-2.5 w-full rounded-full bg-[var(--border)]" />
              <div className="h-2.5 w-11/12 rounded-full bg-[var(--border)]" />
              <div className="h-2.5 w-4/5 rounded-full bg-[var(--border)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PdfGroupManager() {
  const {
    project,
    selectedGroup,
    isHydrated,
    isBusy,
    error,
    clearError,
    selectGroup,
    addGroup,
    addGroups,
    newProject,
    renameGroup,
    setGroupNote,
    setGroupStatus,
    attachPdf,
    removePdf,
    duplicateGroup,
    deleteGroup,
    reorderGroups,
    updateLastViewedPage,
    getPdfBlob,
    downloadProject,
    importProject,
  } = useProject();

  const [loadedPdf, setLoadedPdf] = useState<{
    key: string | null;
    blob: Blob | null;
    error: string | null;
  }>({ key: null, blob: null, error: null });
  const uploadLockRef = useRef(false);
  const [uploadingGroupId, setUploadingGroupId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [createGroupsOpen, setCreateGroupsOpen] = useState(false);
  const [renameGroupId, setRenameGroupId] = useState<string | null>(null);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [removePdfGroupId, setRemovePdfGroupId] = useState<string | null>(null);
  const [pendingProjectFile, setPendingProjectFile] = useState<File | null>(null);
  const [cloudDialogOpen, setCloudDialogOpen] = useState(false);
  const [viewerFailure, setViewerFailure] = useState<{
    key: string | null;
    message: string | null;
  }>({ key: null, message: null });
  const projectInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const replacementGroupRef = useRef<string | null>(null);
  const cloud = useCloudMigration({ project, getPdfBlob });

  const renameTarget = project.groups.find((group: PdfGroup) => group.id === renameGroupId);
  const deleteTarget = project.groups.find((group: PdfGroup) => group.id === deleteGroupId);
  const removePdfTarget = project.groups.find(
    (group: PdfGroup) => group.id === removePdfGroupId,
  );
  const selectedPdfGroupId = selectedGroup?.id;
  const selectedFileKey = selectedGroup?.fileKey;

  useEffect(() => {
    if (!error) return;
    toast.error(error.message);
    clearError();
  }, [clearError, error]);

  useEffect(() => {
    let active = true;
    const sourceKey = selectedPdfGroupId && selectedFileKey
      ? `${selectedPdfGroupId}:${selectedFileKey}`
      : null;

    queueMicrotask(() => {
      if (!active) return;
      setLoadedPdf((current) =>
        current.key === sourceKey && current.blob === null && current.error === null
          ? current
          : { key: sourceKey, blob: null, error: null },
      );
    });

    if (!sourceKey || !selectedPdfGroupId) {
      return () => {
        active = false;
      };
    }

    void getPdfBlob(selectedPdfGroupId)
      .then((blob: Blob | null) => {
        if (!active) return;
        if (!blob) {
          setLoadedPdf({
            key: sourceKey,
            blob: null,
            error: "PDF файл олдсонгүй. Файлаа дахин сонгоно уу.",
          });
          return;
        }
        setLoadedPdf({ key: sourceKey, blob, error: null });
      })
      .catch((reason: unknown) => {
        if (active) {
          setLoadedPdf({
            key: sourceKey,
            blob: null,
            error: getMessage(reason, "PDF файлыг сэргээж чадсангүй."),
          });
        }
      });

    return () => {
      active = false;
    };
  }, [getPdfBlob, selectedFileKey, selectedPdfGroupId]);

  const handlePdf = useCallback(
    async (groupId: string, file: File) => {
      if (cloud.isSaving) {
        const message = "Cloud хадгалалт дууссаны дараа PDF-ээ өөрчилнө үү.";
        toast.info(message);
        throw new Error(message);
      }
      if (uploadLockRef.current) {
        const message = "Өмнөх PDF-г уншиж дуустал түр хүлээнэ үү.";
        toast.info(message);
        throw new Error(message);
      }
      const validationError = validatePdfFile(file);
      if (validationError) {
        toast.error(validationError);
        throw new Error(validationError);
      }

      uploadLockRef.current = true;
      setUploadingGroupId(groupId);
      try {
        const { pageCount } = await inspectPdfFile(file);
        await attachPdf(groupId, file, pageCount);
        setLoadedPdf({ key: null, blob: null, error: null });
        selectGroup(groupId);
        toast.success("PDF амжилттай нэмэгдлээ.", {
          description: `${file.name} · ${pageCount.toLocaleString("mn-MN")} хуудас`,
        });
      } catch (reason) {
        const isProjectError = isProjectManagerError(reason);
        const message = isProjectError ? reason.message : getPdfErrorMessage(reason);
        if (!isProjectError) toast.error(message);
        throw new Error(message);
      } finally {
        uploadLockRef.current = false;
        setUploadingGroupId(null);
      }
    },
    [attachPdf, cloud.isSaving, selectGroup],
  );

  const openPdfPicker = useCallback(
    (groupId?: string) => {
      const targetId = groupId ?? selectedGroup?.id;
      if (!targetId) {
        toast.info("Эхлээд бүлэг үүсгэнэ үү.");
        return;
      }
      replacementGroupRef.current = targetId;
      pdfInputRef.current?.click();
    },
    [selectedGroup?.id],
  );

  const handleReplacementInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const groupId = replacementGroupRef.current;
    event.target.value = "";
    if (file && groupId) void handlePdf(groupId, file).catch(() => undefined);
  };

  const saveProject = useCallback(async () => {
    try {
      await downloadProject();
      toast.success("Төсөл хадгалагдлаа.", {
        description: "Project metadata JSON файлаар татагдлаа.",
      });
    } catch (reason) {
      if (!isProjectManagerError(reason)) {
        toast.error(getMessage(reason, "Project хадгалах үед алдаа гарлаа."));
      }
    }
  }, [downloadProject]);

  const openProjectFile = () => projectInputRef.current?.click();

  const handleProjectInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validationError = validateProjectFile(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setPendingProjectFile(file);
  };

  const saveToCloud = useCallback(() => {
    setCloudDialogOpen(true);
    void cloud.saveToCloud().catch(() => undefined);
  }, [cloud]);

  useKeyboardShortcuts({
    enabled:
      isHydrated &&
      !isBusy &&
      !cloud.isSaving &&
      !cloudDialogOpen &&
      !uploadingGroupId &&
      !newProjectOpen &&
      !createGroupsOpen &&
      !renameTarget &&
      !deleteTarget &&
      !removePdfTarget &&
      !pendingProjectFile,
    onOpenPdf: () => openPdfPicker(),
    onSaveProject: () => void saveProject(),
    onPreviousPage: () =>
      document.querySelector<HTMLButtonElement>('[data-pdf-action="previous-page"]')?.click(),
    onNextPage: () =>
      document.querySelector<HTMLButtonElement>('[data-pdf-action="next-page"]')?.click(),
    onZoomIn: () =>
      document.querySelector<HTMLButtonElement>('[data-pdf-action="zoom-in"]')?.click(),
    onZoomOut: () =>
      document.querySelector<HTMLButtonElement>('[data-pdf-action="zoom-out"]')?.click(),
    onFocusGoToPage: () => {
      const input = document.querySelector<HTMLInputElement>("[data-pdf-page-input]");
      input?.focus();
      input?.select();
    },
  });

  const groupCards = useMemo(
    () =>
      project.groups.map((group: PdfGroup) => ({
        id: group.id,
        name: group.name,
        fileName: group.fileName,
        pageCount: group.pageCount,
        status:
          uploadingGroupId === group.id
            ? ("loading" as const)
            : group.status === "error"
              ? ("error" as const)
              : group.status === "missing" || group.needsFile
                ? ("missing" as const)
              : group.fileKey
                ? ("ready" as const)
                : ("empty" as const),
        error:
          group.error ||
          (group.needsFile ? "PDF файлыг дахин сонгох шаардлагатай." : undefined),
      })),
    [project.groups, uploadingGroupId],
  );

  if (!isHydrated) return <WorkspaceSkeleton />;

  const selectedSourceKey = selectedGroup?.fileKey
    ? `${selectedGroup.id}:${selectedGroup.fileKey}`
    : null;
  const sourceStateMatches = loadedPdf.key === selectedSourceKey;
  const pdfSource = sourceStateMatches ? loadedPdf.blob : null;
  const sourceError = sourceStateMatches ? loadedPdf.error : null;
  const sourceLoading =
    Boolean(selectedSourceKey) &&
    (!sourceStateMatches || (!pdfSource && !sourceError));
  const viewerError = viewerFailure.key === selectedSourceKey ? viewerFailure.message : null;
  const uploadError = sourceError || viewerError || (selectedGroup?.needsFile
    ? "Project metadata нээгдсэн. PDF файлаа дахин сонгоно уу."
    : null);

  return (
    <div className="flex h-dvh min-w-[320px] flex-col overflow-hidden bg-[var(--background)] text-[var(--text)]">
      <Toaster
        position="bottom-right"
        theme="light"
        richColors
        closeButton
        toastOptions={{ className: "font-[var(--font-manrope)]" }}
      />

      <input
        ref={projectInputRef}
        type="file"
        accept="application/json,.json,.pdfgroup.json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleProjectInput}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleReplacementInput}
      />

      <Header
        onNewProject={() => setNewProjectOpen(true)}
        onSaveProject={() => void saveProject()}
        onOpenProject={openProjectFile}
        onCloudSave={saveToCloud}
        onShare={() => setCloudDialogOpen(true)}
        isCloudSaving={cloud.isSaving}
        cloudReady={Boolean(cloud.binding?.lastSyncedAt)}
        cloudProgress={cloud.progress.percent}
        disabled={isBusy || Boolean(uploadingGroupId) || cloud.isSaving}
      />

      <aside
        role="note"
        className="flex shrink-0 items-start justify-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-center text-[10px] font-medium leading-4 text-[var(--text-muted)] sm:items-center sm:text-[11px]"
      >
        <ShieldCheck
          aria-hidden="true"
          className="mt-0.5 size-3.5 shrink-0 text-[var(--accent)] sm:mt-0"
        />
        <span>
          {cloud.binding?.lastSyncedAt
            ? "Local хуулбар browser-д хэвээр үлдсэн. “Cloud шинэчлэх” дарахад өөрчлөлтүүд cloud руу синк хийгдэнэ."
            : "Таны PDF файлууд сервер рүү автоматаар илгээгдэхгүй. “Cloud-д хадгалах” үйлдлийг зөвшөөрсний дараа л upload хийгдэнэ."}
        </span>
      </aside>

      {project.groups.length > 0 ? (
        <GroupTabs
          groups={groupCards}
          selectedGroupId={project.selectedGroupId}
          onSelectGroup={selectGroup}
          onReorder={reorderGroups}
          onAddGroup={() => void addGroup()}
          onRenameGroup={setRenameGroupId}
          onReplacePdf={openPdfPicker}
          onRemovePdf={setRemovePdfGroupId}
          onDuplicateGroup={(groupId) => {
            void duplicateGroup(groupId)
              .then((duplicate) => {
                setLoadedPdf({ key: null, blob: null, error: null });
                focusGroupTab(duplicate.id);
                toast.success("Бүлэг амжилттай хувилагдлаа.");
              })
              .catch((reason: unknown) => {
                if (!isProjectManagerError(reason)) {
                  toast.error(getMessage(reason, "Бүлгийг хувилж чадсангүй."));
                }
              });
          }}
          onDeleteGroup={setDeleteGroupId}
          disabled={isBusy || Boolean(uploadingGroupId) || cloud.isSaving}
        />
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col">
        {project.groups.length === 0 ? (
          <EmptyState
            onCreateDefault={() => setCreateGroupsOpen(true)}
            onCreateOne={() => void addGroup()}
            disabled={isBusy || Boolean(uploadingGroupId) || cloud.isSaving}
          />
        ) : selectedGroup ? (
          <section className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 sm:px-5 sm:pb-5 lg:px-6">
            <div className="mb-3 flex shrink-0 flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-sm lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <FileText className="size-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-extrabold sm:text-base" title={selectedGroup.name}>
                    {selectedGroup.name}
                  </h1>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-[var(--text-muted)] sm:text-xs">
                    <span className="max-w-56 truncate" title={selectedGroup.fileName}>
                      {selectedGroup.fileName || "PDF оруулаагүй"}
                    </span>
                    {selectedGroup.pageCount > 0 ? (
                      <span>{selectedGroup.pageCount.toLocaleString("mn-MN")} хуудас</span>
                    ) : null}
                    {selectedGroup.fileSize ? (
                      <span className="inline-flex items-center gap-1">
                        <HardDrive className="size-3" /> {formatFileSize(selectedGroup.fileSize)}
                      </span>
                    ) : null}
                    <span className="hidden items-center gap-1 xl:inline-flex">
                      <CalendarDays className="size-3" /> {formatCreatedAt(selectedGroup.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              <label className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/15 lg:w-[360px]">
                <MessageSquareText className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                <span className="sr-only">Бүлгийн тэмдэглэл</span>
                <input
                  value={selectedGroup.note || ""}
                  onChange={(event) => setGroupNote(selectedGroup.id, event.target.value)}
                  placeholder="Тэмдэглэл нэмэх…"
                  maxLength={2000}
                  disabled={cloud.isSaving}
                  className="h-10 min-w-0 flex-1 bg-transparent text-xs font-medium text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] sm:text-sm"
                />
              </label>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] shadow-[var(--shadow)]">
              {sourceLoading ? (
                <PdfViewerSkeleton />
              ) : pdfSource ? (
                <PdfViewer
                  key={`${selectedGroup.id}:${selectedGroup.fileKey}`}
                  source={pdfSource}
                  fileName={selectedGroup.fileName || "document.pdf"}
                  pageCount={selectedGroup.pageCount}
                  initialPage={selectedGroup.lastViewedPage}
                  onPageChange={(page) => updateLastViewedPage(selectedGroup.id, page)}
                  onError={(message) => {
                    setViewerFailure({ key: selectedSourceKey, message });
                    toast.error(message);
                  }}
                  onDocumentError={(message) => {
                    try {
                      setGroupStatus(selectedGroup.id, "error", message);
                    } catch {
                      // useProject already exposes persistence failures through
                      // its shared error state; the viewer must keep its own
                      // document error visible instead of rejecting its loader.
                    }
                  }}
                  onDocumentLoad={() => {
                    try {
                      setGroupStatus(selectedGroup.id, "ready");
                    } catch {
                      // A metadata write failure must not turn a successfully
                      // rendered PDF into a PDF.js loading error.
                    }
                  }}
                  className="h-full"
                />
              ) : (
                <div className="h-full overflow-auto p-4 sm:p-7 lg:p-10">
                  <div className="mx-auto flex min-h-full max-w-3xl items-center">
                    <PdfDropZone
                      onFileSelect={(file) => handlePdf(selectedGroup.id, file)}
                      isLoading={uploadingGroupId === selectedGroup.id}
                      error={uploadError}
                      disabled={isBusy || cloud.isSaving}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : null}
      </main>

      <CreateProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        initialName="Шинэ төсөл"
        loading={isBusy || cloud.isSaving}
        onCreate={async ({ name, groupCount }) => {
          await newProject(name, groupCount);
          toast.success("Шинэ төсөл үүслээ.");
        }}
      />

      <CreateGroupsDialog
        open={createGroupsOpen}
        onOpenChange={setCreateGroupsOpen}
        initialCount={21}
        loading={isBusy || cloud.isSaving}
        onCreate={async (count) => {
          await addGroups(count);
          toast.success(`${count.toLocaleString("mn-MN")} бүлэг үүслээ.`);
        }}
      />

      <RenameGroupDialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open) setRenameGroupId(null);
        }}
        currentName={renameTarget?.name || ""}
        loading={isBusy || cloud.isSaving}
        onRename={async (name) => {
          if (!renameTarget) return;
          await renameGroup(renameTarget.id, name);
          setRenameGroupId(null);
          toast.success("Бүлгийн нэр өөрчлөгдлөө.");
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingProjectFile)}
        onOpenChange={(open) => {
          if (!open) setPendingProjectFile(null);
        }}
        title="Өөр төсөл нээх үү?"
        description={
          pendingProjectFile
            ? `“${pendingProjectFile.name}” файлыг нээхэд одоогийн local төсөл болон IndexedDB-д хадгалсан PDF хуулбарууд солигдоно.`
            : ""
        }
        confirmLabel="Төсөл нээх"
        destructive
        loading={isBusy || cloud.isSaving}
        onConfirm={async () => {
          if (!pendingProjectFile) return;
          try {
            await importProject(pendingProjectFile);
            setPendingProjectFile(null);
            toast.success("Төсөл амжилттай нээгдлээ.", {
              description: "PDF файлтай бүлгүүдэд эх файлыг дахин сонгоно уу.",
            });
          } catch (reason) {
            if (!isProjectManagerError(reason)) {
              toast.error(getMessage(reason, "Project файлыг нээж чадсангүй."));
            }
            throw reason;
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(removePdfTarget)}
        onOpenChange={(open) => {
          if (!open) setRemovePdfGroupId(null);
        }}
        title="PDF файлыг устгах уу?"
        description={
          removePdfTarget
            ? `“${removePdfTarget.name}” бүлгийн PDF болон хадгалсан уншсан байрлал устна. Бүлэг өөрөө үлдэнэ.`
            : ""
        }
        confirmLabel="PDF устгах"
        destructive
        loading={isBusy || cloud.isSaving}
        onConfirm={async () => {
          if (!removePdfTarget) return;
          await removePdf(removePdfTarget.id);
          setRemovePdfGroupId(null);
          toast.success("PDF файл устгагдлаа.");
        }}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteGroupId(null);
        }}
        groupName={deleteTarget?.name || ""}
        hasPdf={Boolean(deleteTarget?.fileName)}
        loading={isBusy || cloud.isSaving}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteGroup(deleteTarget.id);
          setDeleteGroupId(null);
          focusGroupTab();
          toast.success("Бүлэг устгагдлаа.");
        }}
      />

      <CloudShareDialog
        open={cloudDialogOpen}
        onOpenChange={setCloudDialogOpen}
        binding={cloud.binding}
        progress={cloud.progress}
        isSaving={cloud.isSaving}
        error={cloud.error}
        warning={cloud.warning}
        onRetry={saveToCloud}
      />
    </div>
  );
}
