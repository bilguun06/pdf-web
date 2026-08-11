"use client";

import {
  AlertTriangle,
  CalendarDays,
  Cloud,
  FileText,
  HardDrive,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import {
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
  RenameGroupDialog,
} from "@/components/dialogs";
import { EmptyState } from "@/components/EmptyState";
import { GroupTabs } from "@/components/GroupTabs";
import { Header } from "@/components/Header";
import { PdfDropZone } from "@/components/PdfDropZone";
import { PdfViewer } from "@/components/PdfViewer";
import { CloudShareDialog } from "@/components/cloud/CloudShareDialog";
import { Button } from "@/components/ui/Button";
import {
  type CloudBinding,
  type CloudGroup,
  useCloudProject,
} from "@/hooks/useCloudProject";
import { formatFileSize, validatePdfFile } from "@/lib/file";
import { getPdfErrorMessage, inspectPdfFile } from "@/lib/pdf-engine";

export interface CloudProjectEditorProps {
  projectId: string;
}

const MAX_CLOUD_GROUPS_PER_PROJECT = 500;

function messageFrom(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Огноо тодорхойгүй";
  return new Intl.DateTimeFormat("mn-MN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function EditorLoading() {
  return (
    <main className="grid h-dvh min-w-[320px] place-items-center bg-[var(--background)] p-6" role="status">
      <div className="text-center text-[var(--text)]">
        <LoaderCircle className="mx-auto size-8 animate-spin text-[var(--accent)]" aria-hidden="true" />
        <p className="mt-4 text-sm font-bold">Cloud төслийг ачаалж байна…</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Editor эрхийг шалгаж байна.</p>
      </div>
    </main>
  );
}

function EditorError({
  message,
  canRetry,
  onRetry,
}: {
  message: string;
  canRetry: boolean;
  onRetry: () => void;
}) {
  return (
    <main className="grid h-dvh min-w-[320px] place-items-center bg-[var(--background)] p-5 text-[var(--text)]">
      <section className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow)]">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
          <AlertTriangle className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-xl font-extrabold">Cloud төслийг нээж чадсангүй</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{message}</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          {canRetry ? (
            <Button variant="primary" onClick={onRetry}>
              <RefreshCw className="size-4" /> Дахин оролдох
            </Button>
          ) : null}
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-semibold hover:bg-[var(--surface-muted)]"
          >
            Local төсөл рүү буцах
          </Link>
        </div>
      </section>
    </main>
  );
}

export function CloudProjectEditor({ projectId }: CloudProjectEditorProps) {
  const {
    project,
    selectedGroup,
    selectedGroupId,
    isLoading,
    isBusy,
    error,
    hasEditToken,
    shareUrl,
    editorUrl,
    uploadProgress,
    refresh,
    selectGroup,
    renameProject,
    addGroup,
    updateGroup,
    deleteGroup,
    reorderGroups,
    uploadPdf,
    removePdf,
    updateLastViewedPage,
  } = useCloudProject(projectId);

  const [shareOpen, setShareOpen] = useState(false);
  const [createGroupsOpen, setCreateGroupsOpen] = useState(false);
  const [renameGroupId, setRenameGroupId] = useState<string | null>(null);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [removePdfGroupId, setRemovePdfGroupId] = useState<string | null>(null);
  const [replacementGroupId, setReplacementGroupId] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState<{
    projectId: string;
    value: string;
  } | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [preparingGroupId, setPreparingGroupId] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const pdfOperationLockRef = useRef(false);
  const editorBusy = isBusy || preparingGroupId !== null;
  const remainingGroupCapacity = Math.max(
    0,
    MAX_CLOUD_GROUPS_PER_PROJECT - (project?.groups.length ?? 0),
  );
  const canAddGroups = remainingGroupCapacity > 0;

  const renameTarget = project?.groups.find((group) => group.id === renameGroupId);
  const deleteTarget = project?.groups.find((group) => group.id === deleteGroupId);
  const removePdfTarget = project?.groups.find((group) => group.id === removePdfGroupId);

  const shareBinding = useMemo<CloudBinding | null>(() => {
    if (!project || !shareUrl || !editorUrl) return null;
    return {
      version: 1,
      localProjectId: project.id,
      localProjectCreatedAt: project.createdAt,
      projectId: project.id,
      shareId: project.shareId,
      editToken: "",
      shareUrl,
      editorUrl,
      groupMap: {},
      clientGroupIds: {},
      uploadedFileKeys: {},
      lastSyncedAt: project.updatedAt,
    };
  }, [editorUrl, project, shareUrl]);

  const groupCards = useMemo(
    () => (project?.groups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      fileName: group.pdf?.originalName,
      pageCount: group.pdf?.pageCount ?? 0,
      status: group.pdf ? ("ready" as const) : ("empty" as const),
    })),
    [project?.groups],
  );

  const handlePdf = async (groupId: string, file: File) => {
    if (pdfOperationLockRef.current) {
      const message = "Өмнөх PDF үйлдэл дууссаны дараа дахин оролдоно уу.";
      toast.info(message);
      throw new Error(message);
    }
    const validationError = validatePdfFile(file);
    if (validationError) {
      toast.error(validationError);
      throw new Error(validationError);
    }
    pdfOperationLockRef.current = true;
    setPreparingGroupId(groupId);
    try {
      const { pageCount } = await inspectPdfFile(file);
      await uploadPdf(groupId, file, pageCount);
      selectGroup(groupId);
      toast.success("PDF cloud-д амжилттай хадгалагдлаа.", {
        description: `${file.name} · ${pageCount.toLocaleString("mn-MN")} хуудас`,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : getPdfErrorMessage(caught);
      toast.error(message);
      throw caught;
    } finally {
      pdfOperationLockRef.current = false;
      setPreparingGroupId(null);
    }
  };

  const openPdfPicker = (groupId: string) => {
    setReplacementGroupId(groupId);
    pdfInputRef.current?.click();
  };

  const handleReplacement = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const groupId = replacementGroupId;
    setReplacementGroupId(null);
    if (file && groupId) void handlePdf(groupId, file).catch(() => undefined);
  };

  const commitProjectName = async () => {
    if (!project) return;
    const name = (projectNameDraft?.projectId === project.id
      ? projectNameDraft.value
      : project.name).trim();
    if (!name) {
      setProjectNameDraft(null);
      toast.error("Төслийн нэр хоосон байж болохгүй.");
      return;
    }
    if (name === project.name) {
      setProjectNameDraft(null);
      return;
    }
    try {
      await renameProject(name);
      setProjectNameDraft(null);
      toast.success("Төслийн нэр хадгалагдлаа.");
    } catch (caught) {
      setProjectNameDraft(null);
      toast.error(messageFrom(caught, "Төслийн нэрийг хадгалж чадсангүй."));
    }
  };

  const commitNote = async (group: CloudGroup) => {
    const draft = noteDrafts[group.id];
    if (draft === undefined || draft === (group.note ?? "")) return;
    try {
      await updateGroup(group.id, { note: draft.trim() ? draft : null });
      setNoteDrafts((current) => {
        const next = { ...current };
        delete next[group.id];
        return next;
      });
    } catch (caught) {
      toast.error(messageFrom(caught, "Тэмдэглэлийг хадгалж чадсангүй."));
    }
  };

  if (isLoading) return <EditorLoading />;
  if (!project) {
    return (
      <EditorError
        message={error ?? "Cloud төсөл олдсонгүй."}
        canRetry={hasEditToken}
        onRetry={() => void refresh().catch(() => undefined)}
      />
    );
  }

  return (
    <div className="flex h-dvh min-w-[320px] flex-col overflow-hidden bg-[var(--background)] text-[var(--text)]">
      <Toaster position="bottom-right" theme="light" richColors closeButton />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleReplacement}
      />

      <Header
        onShare={() => setShareOpen(true)}
        cloudReady
        disabled={editorBusy}
      />

      <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:flex-row sm:items-center sm:px-6">
        <span className="inline-flex shrink-0 items-center gap-2 text-xs font-bold text-[var(--accent)]">
          <Cloud className="size-4" aria-hidden="true" /> Cloud editor
        </span>
        <input
          value={projectNameDraft?.projectId === project.id ? projectNameDraft.value : project.name}
          onChange={(event) => setProjectNameDraft({ projectId: project.id, value: event.target.value })}
          onBlur={() => void commitProjectName()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setProjectNameDraft(null);
              event.currentTarget.blur();
            }
          }}
          maxLength={200}
          disabled={editorBusy}
          aria-label="Төслийн нэр"
          className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-extrabold outline-none hover:border-[var(--border)] focus:border-[var(--accent)] focus:bg-[var(--surface-muted)] focus:ring-2 focus:ring-[var(--accent)]/15"
        />
        <span className="text-[11px] text-[var(--text-muted)]">Өөрчлөлт cloud-д шууд хадгалагдана</span>
      </div>

      {error ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-2 text-xs text-[var(--danger)]" role="alert">
          <span className="truncate">{error}</span>
          <Button size="sm" variant="ghost" onClick={() => void refresh().catch(() => undefined)}>
            <RefreshCw className="size-3.5" /> Дахин унших
          </Button>
        </div>
      ) : null}

      {project.groups.length > 0 ? (
        <GroupTabs
          groups={groupCards}
          selectedGroupId={selectedGroupId}
          onSelectGroup={selectGroup}
          onReorder={(activeId, overId) => {
            void reorderGroups(activeId, overId).catch((caught) =>
              toast.error(messageFrom(caught, "Бүлгийн дарааллыг хадгалж чадсангүй.")),
            );
          }}
          onAddGroup={canAddGroups
            ? () => void addGroup().catch((caught) =>
                toast.error(messageFrom(caught, "Бүлэг нэмэж чадсангүй.")),
              )
            : undefined}
          onRenameGroup={setRenameGroupId}
          onReplacePdf={openPdfPicker}
          onRemovePdf={setRemovePdfGroupId}
          onDeleteGroup={setDeleteGroupId}
          disabled={editorBusy}
        />
      ) : null}

      <main className="flex min-h-0 flex-1 flex-col">
        {project.groups.length === 0 ? (
          <EmptyState
            onCreateDefault={() => setCreateGroupsOpen(true)}
            onCreateOne={() => void addGroup().catch((caught) =>
              toast.error(messageFrom(caught, "Бүлэг нэмэж чадсангүй.")),
            )}
            disabled={editorBusy}
          />
        ) : selectedGroup ? (
          <section className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 sm:px-5 sm:pb-5 lg:px-6">
            <div className="mb-3 flex shrink-0 flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 shadow-sm lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <FileText className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-extrabold sm:text-base">{selectedGroup.name}</h1>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--text-muted)] sm:text-xs">
                    <span className="max-w-56 truncate">{selectedGroup.pdf?.originalName ?? "PDF оруулаагүй"}</span>
                    {selectedGroup.pdf ? <span>{selectedGroup.pdf.pageCount.toLocaleString("mn-MN")} хуудас</span> : null}
                    {selectedGroup.pdf?.fileSize ? (
                      <span className="inline-flex items-center gap-1"><HardDrive className="size-3" />{formatFileSize(selectedGroup.pdf.fileSize)}</span>
                    ) : null}
                    <span className="hidden items-center gap-1 xl:inline-flex"><CalendarDays className="size-3" />{formatDate(selectedGroup.createdAt)}</span>
                  </div>
                </div>
              </div>
              <label className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/15 lg:w-[360px]">
                <MessageSquareText className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                <span className="sr-only">Бүлгийн тэмдэглэл</span>
                <input
                  value={noteDrafts[selectedGroup.id] ?? selectedGroup.note ?? ""}
                  onChange={(event) => setNoteDrafts((current) => ({ ...current, [selectedGroup.id]: event.target.value }))}
                  onBlur={() => void commitNote(selectedGroup)}
                  placeholder="Тэмдэглэл нэмэх…"
                  maxLength={2000}
                  disabled={editorBusy}
                  className="h-10 min-w-0 flex-1 bg-transparent text-xs font-medium outline-none sm:text-sm"
                />
              </label>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] shadow-[var(--shadow)]">
              {selectedGroup.pdf ? (
                <PdfViewer
                  key={selectedGroup.pdf.id}
                  source={selectedGroup.pdf.blobUrl}
                  fileName={selectedGroup.pdf.originalName}
                  pageCount={selectedGroup.pdf.pageCount}
                  initialPage={selectedGroup.lastViewedPage}
                  onPageChange={(page) => updateLastViewedPage(selectedGroup.id, page)}
                  onError={(message) => toast.error(message)}
                  className="h-full"
                />
              ) : (
                <div className="h-full overflow-auto p-4 sm:p-7 lg:p-10">
                  <div className="mx-auto flex min-h-full max-w-3xl items-center">
                    <PdfDropZone
                      onFileSelect={(file) => handlePdf(selectedGroup.id, file)}
                      isLoading={preparingGroupId === selectedGroup.id || uploadProgress !== null}
                      loadingMessage={uploadProgress === null ? "PDF-г шалгаж байна…" : `PDF cloud-д байршуулж байна… ${uploadProgress}%`}
                      disabled={editorBusy}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
              {selectedGroup.pdf && uploadProgress !== null ? (
                <div className="absolute inset-x-4 top-4 z-20 rounded-xl border border-[var(--border)] bg-[var(--surface)]/95 p-3 shadow-lg backdrop-blur">
                  <div className="flex justify-between gap-3 text-xs font-bold"><span>PDF cloud-д байршуулж байна…</span><span>{uploadProgress}%</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full bg-[var(--accent)]" style={{ width: `${uploadProgress}%` }} /></div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>

      <CloudShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        binding={shareBinding}
        progress={{ phase: "complete", percent: 100, message: "Cloud-д хадгалагдсан.", completedFiles: 0, totalFiles: 0 }}
        isSaving={false}
        onRetry={() => void refresh().catch(() => undefined)}
      />

      <CreateGroupsDialog
        open={createGroupsOpen}
        onOpenChange={setCreateGroupsOpen}
        initialCount={21}
        maxCount={remainingGroupCapacity}
        loading={editorBusy}
        onCreate={async (count) => {
          if (count > remainingGroupCapacity) {
            throw new Error(
              `Cloud төсөлд хамгийн ихдээ ${remainingGroupCapacity.toLocaleString("mn-MN")} бүлэг нэмж болно.`,
            );
          }
          for (let index = 0; index < count; index += 1) await addGroup();
          toast.success(`${count.toLocaleString("mn-MN")} бүлэг cloud-д үүслээ.`);
        }}
      />

      <RenameGroupDialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => { if (!open) setRenameGroupId(null); }}
        currentName={renameTarget?.name ?? ""}
        loading={editorBusy}
        onRename={async (name) => {
          if (!renameTarget) return;
          await updateGroup(renameTarget.id, { name });
          setRenameGroupId(null);
          toast.success("Бүлгийн нэр cloud-д хадгалагдлаа.");
        }}
      />

      <ConfirmDialog
        open={Boolean(removePdfTarget)}
        onOpenChange={(open) => { if (!open) setRemovePdfGroupId(null); }}
        title="PDF файлыг cloud-оос устгах уу?"
        description={removePdfTarget ? `“${removePdfTarget.name}” бүлгийн PDF устна. Бүлэг өөрөө үлдэнэ.` : ""}
        confirmLabel="PDF устгах"
        destructive
        loading={editorBusy}
        onConfirm={async () => {
          if (!removePdfTarget) return;
          await removePdf(removePdfTarget.id);
          setRemovePdfGroupId(null);
          toast.success("PDF cloud-оос устгагдлаа.");
        }}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open) setDeleteGroupId(null); }}
        groupName={deleteTarget?.name ?? ""}
        hasPdf={Boolean(deleteTarget?.pdf)}
        loading={editorBusy}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteGroup(deleteTarget.id);
          setDeleteGroupId(null);
          toast.success("Бүлэг cloud-оос устгагдлаа.");
        }}
      />
    </div>
  );
}
