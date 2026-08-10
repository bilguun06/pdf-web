"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_NEW_PROJECT_GROUP_COUNT,
  DEFAULT_PROJECT_NAME,
  READINESS_TEMPLATE_VERSION,
  ProjectManagerError,
  addGroups as addGroupsToProject,
  attachPdfMetadata,
  createEntityId,
  createDemoProject,
  createProject as createProjectModel,
  deleteProjectGroup,
  downloadProjectJson,
  duplicateGroupMetadata,
  importProjectData,
  markPdfMissing,
  migrateLegacyDemoProject,
  removePdfMetadata,
  renameGroup as renameProjectGroup,
  renameProject as renameProjectModel,
  reorderProjectGroups,
  selectProjectGroup,
  serializeProject,
  setGroupNote as setProjectGroupNote,
  setGroupStatus as setProjectGroupStatus,
  setLastViewedPage,
  toProjectError,
  validateProject,
} from "@/lib/project";
import { validatePdfFile } from "@/lib/file";
import {
  copyPdfBlob,
  deleteGroupPdfBlobs,
  deletePdfBlob,
  deleteProjectPdfBlobs,
  getPdfBlobRecord,
  loadProjectMetadata,
  prunePdfBlobStorage,
  saveProjectMetadata,
  storePdfBlob,
} from "@/lib/storage";
import type {
  AddGroupsOptions,
  CreateProjectOptions,
  PdfGroup,
  PdfGroupStatus,
  PdfProject,
  ProjectError,
  ProjectErrorCode,
  UseProjectOptions,
} from "@/types/project";

type ProjectUpdater = (current: PdfProject) => PdfProject;

interface CommitProjectOptions {
  deferPersistence?: boolean;
}

interface AsyncOperationContext {
  assertCurrent: () => void;
}

interface PendingPagePersistence {
  generation: number;
  project: PdfProject;
}

const LAST_VIEWED_PAGE_PERSIST_DELAY_MS = 200;

export type NewProjectInput =
  | string
  | number
  | Omit<CreateProjectOptions, "now" | "id">;

export type ProjectImportSource = File | string | object;

export interface AddGroupFunction {
  (): PdfGroup;
  (name: string): PdfGroup;
  (count: number): PdfGroup[];
}

export interface UseProjectResult {
  project: PdfProject;
  groups: PdfGroup[];
  selectedGroup: PdfGroup | undefined;
  selectedGroupId: string | undefined;
  isHydrated: boolean;
  /** Alias useful to consumers that prefer a shorter flag name. */
  hydrated: boolean;
  isBusy: boolean;
  error: ProjectError | null;
  clearError: () => void;
  selectGroup: (groupId: string) => void;
  addGroup: AddGroupFunction;
  addGroups: (options?: number | AddGroupsOptions) => PdfGroup[];
  newProject: (
    input?: NewProjectInput,
    groupCount?: number,
  ) => Promise<PdfProject>;
  createNewProject: (
    input?: NewProjectInput,
    groupCount?: number,
  ) => Promise<PdfProject>;
  renameProject: (name: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  updateGroupNote: (groupId: string, note: string) => void;
  setGroupNote: (groupId: string, note: string) => void;
  setGroupStatus: (
    groupId: string,
    status: PdfGroupStatus,
    error?: string,
  ) => void;
  attachPdf: (
    groupId: string,
    file: File,
    pageCount: number,
  ) => Promise<PdfGroup>;
  replacePdf: (
    groupId: string,
    file: File,
    pageCount: number,
  ) => Promise<PdfGroup>;
  removePdf: (groupId: string) => Promise<void>;
  duplicateGroup: (groupId: string) => Promise<PdfGroup>;
  deleteGroup: (groupId: string) => Promise<void>;
  reorderGroups: (activeId: string, overId: string) => void;
  updateLastViewedPage: (groupId: string, page: number) => void;
  /** Reads a group's Blob by group ID (callers never need to know fileKey). */
  getPdfBlob: (groupId: string) => Promise<Blob | null>;
  retrievePdfBlob: (groupId: string) => Promise<Blob | null>;
  exportProject: () => string;
  downloadProject: (fileName?: string) => void;
  saveProject: (fileName?: string) => void;
  importProject: (source: ProjectImportSource) => Promise<PdfProject>;
  openProject: (source: ProjectImportSource) => Promise<PdfProject>;
}

function operationError(
  error: unknown,
  code: ProjectErrorCode,
  message: string,
  groupId?: string,
): ProjectManagerError {
  if (error instanceof ProjectManagerError) return error;
  return new ProjectManagerError(code, message, {
    groupId,
    cause: error,
    details: error instanceof Error ? error.message : undefined,
  });
}

function notHydratedError(): ProjectManagerError {
  return new ProjectManagerError(
    "NOT_HYDRATED",
    "Төсөл ачаалж дуусаагүй байна. Түр хүлээнэ үү.",
  );
}

function groupFromProject(project: PdfProject, groupId: string): PdfGroup {
  const group = project.groups.find((candidate) => candidate.id === groupId);
  if (!group) {
    throw new ProjectManagerError("GROUP_NOT_FOUND", "Бүлэг олдсонгүй.", {
      groupId,
    });
  }
  return group;
}

function normalizeNewProjectInput(
  input: NewProjectInput | undefined,
  groupCount: number | undefined,
): Omit<CreateProjectOptions, "now" | "id"> {
  if (typeof input === "string") {
    return {
      name: input,
      groupCount: groupCount ?? DEFAULT_NEW_PROJECT_GROUP_COUNT,
    };
  }
  if (typeof input === "number") {
    return { name: DEFAULT_PROJECT_NAME, groupCount: input };
  }
  return {
    name: input?.name ?? DEFAULT_PROJECT_NAME,
    groupCount:
      input?.groupCount ?? groupCount ?? DEFAULT_NEW_PROJECT_GROUP_COUNT,
  };
}

function createInitialProject(options: UseProjectOptions): PdfProject {
  const name = options.initialProjectName ?? DEFAULT_PROJECT_NAME;
  return options.initialGroupCount === undefined
    ? createDemoProject(name)
    : createProjectModel({ name, groupCount: options.initialGroupCount });
}

function isTextReadable(value: unknown): value is { text: () => Promise<string> } {
  if (typeof value !== "object" || value === null) return false;
  return "text" in value && typeof value.text === "function";
}

async function readImportSource(source: ProjectImportSource): Promise<PdfProject> {
  if (typeof source === "string") return importProjectData(source);
  if (isTextReadable(source)) {
    let text: string;
    try {
      text = await source.text();
    } catch (error) {
      throw new ProjectManagerError(
        "PROJECT_IMPORT_FAILED",
        "Project файлыг уншиж чадсангүй.",
        { cause: error },
      );
    }
    return importProjectData(text);
  }
  return importProjectData(source);
}

async function reconcileStoredPdfFiles(project: PdfProject): Promise<PdfProject> {
  const groups = await Promise.all(
    project.groups.map(async (group): Promise<PdfGroup> => {
      if (!group.fileName) {
        return {
          id: group.id,
          name: group.name,
          pageCount: 0,
          lastViewedPage: 1,
          createdAt: group.createdAt,
          ...(group.note === undefined ? {} : { note: group.note }),
          status: "empty",
        };
      }
      if (!group.fileKey) {
        return {
          ...group,
          fileKey: undefined,
          status: "missing",
          error: "PDF файлыг дахин сонгоно уу.",
          needsFile: true,
        };
      }

      const record = await getPdfBlobRecord(group.fileKey);
      if (
        !record ||
        record.projectId !== project.id ||
        record.groupId !== group.id
      ) {
        return {
          ...group,
          fileKey: undefined,
          status: "missing",
          error: "PDF файлыг дахин сонгоно уу.",
          needsFile: true,
        };
      }
      return {
        ...group,
        fileName: record.fileName || group.fileName,
        fileSize: record.size,
        status: "ready",
        error: undefined,
        needsFile: undefined,
      };
    }),
  );
  return { ...project, groups };
}

export function useProject(options: UseProjectOptions = {}): UseProjectResult {
  const initialOptionsRef = useRef(options);
  const [project, setProject] = useState<PdfProject>(() =>
    createInitialProject(options),
  );
  const projectRef = useRef(project);
  const [isHydrated, setIsHydrated] = useState(false);
  const hydratedRef = useRef(false);
  const [pendingOperations, setPendingOperations] = useState(0);
  const [error, setError] = useState<ProjectError | null>(null);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(false);
  const hydrationRunRef = useRef(0);
  const lifecycleGenerationRef = useRef(0);
  const pendingPagePersistenceRef = useRef<PendingPagePersistence | null>(null);
  const pagePersistenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const discardPendingPagePersistence = useCallback((): void => {
    if (pagePersistenceTimerRef.current !== null) {
      clearTimeout(pagePersistenceTimerRef.current);
      pagePersistenceTimerRef.current = null;
    }
    pendingPagePersistenceRef.current = null;
  }, []);

  const flushPendingPagePersistence = useCallback(
    (reportFailure = true): void => {
      if (pagePersistenceTimerRef.current !== null) {
        clearTimeout(pagePersistenceTimerRef.current);
        pagePersistenceTimerRef.current = null;
      }

      const pending = pendingPagePersistenceRef.current;
      if (!pending) return;
      if (
        pending.generation !== lifecycleGenerationRef.current ||
        !mountedRef.current ||
        !hydratedRef.current
      ) {
        pendingPagePersistenceRef.current = null;
        return;
      }

      try {
        saveProjectMetadata(pending.project);
        if (pendingPagePersistenceRef.current === pending) {
          pendingPagePersistenceRef.current = null;
        }
      } catch (caught) {
        if (reportFailure && mountedRef.current) {
          setError(
            toProjectError(
              operationError(
                caught,
                "STORAGE_WRITE_FAILED",
                "Сүүлд үзсэн хуудсыг хадгалж чадсангүй.",
              ),
            ),
          );
        }
      }
    },
    [],
  );

  const schedulePagePersistence = useCallback(
    (nextProject: PdfProject): void => {
      pendingPagePersistenceRef.current = {
        generation: lifecycleGenerationRef.current,
        project: nextProject,
      };
      if (pagePersistenceTimerRef.current !== null) return;
      pagePersistenceTimerRef.current = setTimeout(
        () => flushPendingPagePersistence(),
        LAST_VIEWED_PAGE_PERSIST_DELAY_MS,
      );
    },
    [flushPendingPagePersistence],
  );

  useEffect(() => {
    mountedRef.current = true;
    const run = hydrationRunRef.current + 1;
    hydrationRunRef.current = run;

    const hydrate = async (): Promise<void> => {
      let nextProject: PdfProject;
      let hydrationError: ProjectError | null = null;
      let metadataAvailable = true;

      try {
        const stored = loadProjectMetadata();
        if (stored === null) {
          nextProject = createInitialProject(initialOptionsRef.current);
        } else {
          nextProject = migrateLegacyDemoProject(validateProject(stored));
        }
      } catch (caught) {
        const normalized = operationError(
          caught,
          "STORAGE_READ_FAILED",
          "Хадгалсан төслийг ачаалж чадсангүй.",
        );
        hydrationError = toProjectError(normalized);
        // Never overwrite malformed/unsupported metadata during recovery. The
        // in-memory demo remains usable, and an explicit user mutation can
        // replace the bad value after the error has been shown.
        metadataAvailable = false;
        nextProject = createInitialProject(initialOptionsRef.current);
      }

      if (nextProject.groups.some((group) => group.fileKey !== undefined)) {
        try {
          nextProject = await reconcileStoredPdfFiles(nextProject);
        } catch (caught) {
          const normalized = operationError(
            caught,
            "STORAGE_READ_FAILED",
            "Хадгалсан PDF файлуудыг сэргээж чадсангүй.",
          );
          hydrationError ??= toProjectError(normalized);
          nextProject = {
            ...nextProject,
            groups: nextProject.groups.map((group) =>
              group.fileKey
                ? {
                    ...group,
                    status: "error" as const,
                    error: "PDF хадгалалтыг нээж чадсангүй.",
                  }
                : group,
            ),
          };
        }
      }

      // StrictMode and rapid remounts can leave an older async hydration in
      // flight. It may finish reading IndexedDB, but it must not overwrite the
      // metadata owned by the current run.
      if (!mountedRef.current || hydrationRunRef.current !== run) return;

      if (metadataAvailable) {
        let metadataSaved = false;
        try {
          saveProjectMetadata(nextProject);
          metadataSaved = true;
        } catch (caught) {
          hydrationError ??= toProjectError(
            operationError(
              caught,
              "STORAGE_WRITE_FAILED",
              "Project хадгалах үед алдаа гарлаа.",
            ),
          );
        }
        if (metadataSaved) {
          // Best-effort retry for cleanup that may have been interrupted by a
          // crash or a previous IndexedDB failure.
          await prunePdfBlobStorage(nextProject).catch(() => undefined);
        }
      }

      if (!mountedRef.current || hydrationRunRef.current !== run) return;
      projectRef.current = nextProject;
      setProject(nextProject);
      setError(hydrationError);
      hydratedRef.current = true;
      setIsHydrated(true);
    };

    void hydrate();
    return () => {
      flushPendingPagePersistence(false);
      mountedRef.current = false;
      hydrationRunRef.current += 1;
      lifecycleGenerationRef.current += 1;
      hydratedRef.current = false;
    };
  }, [flushPendingPagePersistence]);

  useEffect(() => {
    const flush = () => flushPendingPagePersistence();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [flushPendingPagePersistence]);

  const clearError = useCallback(() => setError(null), []);

  const reportError = useCallback((caught: unknown): ProjectManagerError => {
    const normalized = operationError(
      caught,
      "UNKNOWN",
      "Үйлдлийг гүйцэтгэх үед алдаа гарлаа.",
    );
    if (mountedRef.current) setError(toProjectError(normalized));
    return normalized;
  }, []);

  const assertHydrated = useCallback((): void => {
    if (!hydratedRef.current) throw notHydratedError();
  }, []);

  const commitProject = useCallback(
    (
      updater: ProjectUpdater,
      commitOptions: CommitProjectOptions = {},
    ): PdfProject => {
      if (!mountedRef.current || !hydratedRef.current) {
        throw notHydratedError();
      }
      const current = projectRef.current;
      const next = updater(current);
      if (next === current) return current;

      if (commitOptions.deferPersistence) {
        projectRef.current = next;
        setProject(next);
        schedulePagePersistence(next);
        return next;
      }

      // All non-page mutations remain failure-atomic. A successful immediate
      // save includes the latest page state and supersedes its pending snapshot.
      saveProjectMetadata(next);
      discardPendingPagePersistence();
      projectRef.current = next;
      setProject(next);
      return next;
    },
    [discardPendingPagePersistence, schedulePagePersistence],
  );

  const runSyncOperation = useCallback(
    function runSync<T>(operation: () => T): T {
      try {
        assertHydrated();
        if (mountedRef.current) setError(null);
        return operation();
      } catch (caught) {
        throw reportError(caught);
      }
    },
    [assertHydrated, reportError],
  );

  const runAsyncOperation = useCallback(
    function runAsync<T>(
      operation: (context: AsyncOperationContext) => Promise<T>,
      fallback: { code: ProjectErrorCode; message: string; groupId?: string },
    ): Promise<T> {
      try {
        assertHydrated();
      } catch (caught) {
        return Promise.reject(reportError(caught));
      }

      const generation = lifecycleGenerationRef.current;
      const assertCurrent = (): void => {
        if (
          generation !== lifecycleGenerationRef.current ||
          !mountedRef.current ||
          !hydratedRef.current
        ) {
          throw notHydratedError();
        }
      };
      const execute = (): Promise<T> => {
        assertCurrent();
        return operation({ assertCurrent });
      };

      if (mountedRef.current) {
        setError(null);
        setPendingOperations((count) => count + 1);
      }
      const task = operationQueueRef.current.then(execute, execute);
      operationQueueRef.current = task.then(
        () => undefined,
        () => undefined,
      );

      return task
        .catch((caught: unknown) => {
          const normalized = operationError(
            caught,
            fallback.code,
            fallback.message,
            fallback.groupId,
          );
          if (
            mountedRef.current &&
            generation === lifecycleGenerationRef.current
          ) {
            setError(toProjectError(normalized));
          }
          throw normalized;
        })
        .finally(() => {
          if (
            mountedRef.current &&
            generation === lifecycleGenerationRef.current
          ) {
            setPendingOperations((count) => Math.max(0, count - 1));
          }
        });
    },
    [assertHydrated, reportError],
  );

  const selectGroup = useCallback(
    (groupId: string): void => {
      runSyncOperation(() => {
        commitProject((current) => selectProjectGroup(current, groupId));
      });
    },
    [commitProject, runSyncOperation],
  );

  const addGroups = useCallback(
    (addOptions: number | AddGroupsOptions = 1): PdfGroup[] =>
      runSyncOperation(() => {
        const previousIds = new Set(projectRef.current.groups.map((group) => group.id));
        const next = commitProject((current) =>
          addGroupsToProject(current, addOptions),
        );
        return next.groups.filter((group) => !previousIds.has(group.id));
      }),
    [commitProject, runSyncOperation],
  );

  const addGroupCallback = useCallback(
    (countOrName?: number | string): PdfGroup | PdfGroup[] => {
      if (typeof countOrName === "number") return addGroups(countOrName);
      const [created] = addGroups({
        count: 1,
        ...(countOrName === undefined ? {} : { names: [countOrName] }),
      });
      if (!created) {
        throw reportError(
          new ProjectManagerError("UNKNOWN", "Шинэ бүлэг үүсгэж чадсангүй."),
        );
      }
      return created;
    },
    [addGroups, reportError],
  );
  const addGroup = addGroupCallback as AddGroupFunction;

  const newProject = useCallback(
    (input?: NewProjectInput, groupCount?: number): Promise<PdfProject> => {
      const normalizedInput = normalizeNewProjectInput(input, groupCount);
      return runAsyncOperation(
        async () => {
          const next = createProjectModel(normalizedInput);
          const previous = projectRef.current;
          const committed = commitProject(() => next);
          // The new metadata is already durable. Bulk cleanup is intentionally
          // unconditional: a browser crash may have left an IndexedDB record
          // before its fileKey reached metadata. Cleanup failure may leave an
          // orphan, but must never destroy data before the replacement is saved.
          await deleteProjectPdfBlobs(previous.id).catch(() => undefined);
          return committed;
        },
        {
          code: "STORAGE_WRITE_FAILED",
          message: "Шинэ Project үүсгэж чадсангүй.",
        },
      );
    },
    [commitProject, runAsyncOperation],
  );

  const renameProject = useCallback(
    (name: string): void => {
      runSyncOperation(() => {
        commitProject((current) => renameProjectModel(current, name));
      });
    },
    [commitProject, runSyncOperation],
  );

  const renameGroup = useCallback(
    (groupId: string, name: string): void => {
      runSyncOperation(() => {
        commitProject((current) => renameProjectGroup(current, groupId, name));
      });
    },
    [commitProject, runSyncOperation],
  );

  const updateGroupNote = useCallback(
    (groupId: string, note: string): void => {
      runSyncOperation(() => {
        commitProject((current) => setProjectGroupNote(current, groupId, note));
      });
    },
    [commitProject, runSyncOperation],
  );

  const setGroupStatus = useCallback(
    (groupId: string, status: PdfGroupStatus, statusError?: string): void => {
      runSyncOperation(() => {
        commitProject((current) =>
          setProjectGroupStatus(current, groupId, status, statusError),
        );
      });
    },
    [commitProject, runSyncOperation],
  );

  const attachPdf = useCallback(
    (groupId: string, file: File, pageCount: number): Promise<PdfGroup> =>
      runAsyncOperation(
        async ({ assertCurrent }) => {
          const validationError = validatePdfFile(file);
          if (validationError) {
            throw new ProjectManagerError("INVALID_PDF", validationError, {
              groupId,
            });
          }
          if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
            throw new ProjectManagerError(
              "INVALID_PAGE_COUNT",
              "PDF-ийн хуудасны тоо буруу байна.",
              { groupId },
            );
          }

          const before = groupFromProject(projectRef.current, groupId);
          const previousKey = before.fileKey;
          commitProject((current) =>
            setProjectGroupStatus(current, groupId, "loading"),
          );

          let newKey: string;
          try {
            newKey = await storePdfBlob({
              projectId: projectRef.current.id,
              groupId,
              fileName: file.name,
              blob: file.slice(0, file.size, file.type || "application/pdf"),
            });
          } catch (caught) {
            const message =
              caught instanceof Error && caught.message
                ? caught.message
                : "PDF файлыг хөтөч дээр хадгалж чадсангүй.";
            try {
              assertCurrent();
              commitProject((current) =>
                setProjectGroupStatus(current, groupId, "error", message),
              );
            } catch {
              // The original storage error is the most useful failure to report.
            }
            throw caught;
          }

          try {
            assertCurrent();
          } catch (caught) {
            await deletePdfBlob(newKey).catch(() => undefined);
            throw caught;
          }

          let next: PdfProject;
          try {
            next = commitProject((current) =>
              attachPdfMetadata(current, groupId, file, pageCount, newKey),
            );
          } catch (caught) {
            await deletePdfBlob(newKey).catch(() => undefined);
            throw caught;
          }

          if (previousKey && previousKey !== newKey) {
            // The replacement is already committed. A failed best-effort
            // cleanup is safer than reporting the successful replacement as a
            // failure or rolling metadata back to a Blob that may be gone.
            await deletePdfBlob(previousKey).catch(() => undefined);
          }
          return groupFromProject(next, groupId);
        },
        {
          code: "PDF_STORE_FAILED",
          message: "PDF файлыг хадгалж чадсангүй.",
          groupId,
        },
      ),
    [commitProject, runAsyncOperation],
  );

  const removePdf = useCallback(
    (groupId: string): Promise<void> =>
      runAsyncOperation(
        async () => {
          const current = projectRef.current;
          groupFromProject(current, groupId);
          commitProject((latest) => removePdfMetadata(latest, groupId));
          await deleteGroupPdfBlobs(current.id, groupId).catch(() => undefined);
        },
        {
          code: "PDF_DELETE_FAILED",
          message: "PDF файлыг устгаж чадсангүй.",
          groupId,
        },
      ),
    [commitProject, runAsyncOperation],
  );

  const duplicateGroup = useCallback(
    (groupId: string): Promise<PdfGroup> =>
      runAsyncOperation(
        async ({ assertCurrent }) => {
          const current = projectRef.current;
          const source = groupFromProject(current, groupId);
          const duplicateId = createEntityId("group");
          let copiedKey: string | undefined;

          if (source.fileKey && source.fileName) {
            try {
              copiedKey = await copyPdfBlob(source.fileKey, {
                projectId: current.id,
                groupId: duplicateId,
                fileName: source.fileName,
              });
            } catch (caught) {
              if (
                caught instanceof ProjectManagerError &&
                caught.code === "PDF_NOT_FOUND"
              ) {
                assertCurrent();
                commitProject((latest) => markPdfMissing(latest, groupId));
              } else {
                throw caught;
              }
            }
          }

          try {
            assertCurrent();
          } catch (caught) {
            if (copiedKey) await deletePdfBlob(copiedKey).catch(() => undefined);
            throw caught;
          }

          let next: PdfProject;
          try {
            next = commitProject((latest) =>
              duplicateGroupMetadata(latest, groupId, {
                id: duplicateId,
                fileKey: copiedKey,
              }),
            );
          } catch (caught) {
            if (copiedKey) await deletePdfBlob(copiedKey).catch(() => undefined);
            throw caught;
          }
          return groupFromProject(next, duplicateId);
        },
        {
          code: "PDF_STORE_FAILED",
          message: "Бүлгийг хуулж чадсангүй.",
          groupId,
        },
      ),
    [commitProject, runAsyncOperation],
  );

  const deleteGroup = useCallback(
    (groupId: string): Promise<void> =>
      runAsyncOperation(
        async () => {
          const current = projectRef.current;
          groupFromProject(current, groupId);
          commitProject((latest) => deleteProjectGroup(latest, groupId));
          await deleteGroupPdfBlobs(current.id, groupId).catch(() => undefined);
        },
        {
          code: "PDF_DELETE_FAILED",
          message: "Бүлгийг устгаж чадсангүй.",
          groupId,
        },
      ),
    [commitProject, runAsyncOperation],
  );

  const reorderGroups = useCallback(
    (activeId: string, overId: string): void => {
      runSyncOperation(() => {
        commitProject((current) =>
          reorderProjectGroups(current, activeId, overId),
        );
      });
    },
    [commitProject, runSyncOperation],
  );

  const updateLastViewedPage = useCallback(
    (groupId: string, page: number): void => {
      runSyncOperation(() => {
        commitProject(
          (current) => setLastViewedPage(current, groupId, page),
          { deferPersistence: true },
        );
      });
    },
    [commitProject, runSyncOperation],
  );

  const getPdfBlob = useCallback(
    (groupId: string): Promise<Blob | null> =>
      runAsyncOperation(
        async ({ assertCurrent }) => {
          const current = projectRef.current;
          const group = groupFromProject(current, groupId);
          if (!group.fileKey) return null;
          const record = await getPdfBlobRecord(group.fileKey);
          assertCurrent();
          if (
            !record ||
            record.projectId !== current.id ||
            record.groupId !== groupId
          ) {
            commitProject((latest) => markPdfMissing(latest, groupId));
            return null;
          }
          return record.blob;
        },
        {
          code: "PDF_READ_FAILED",
          message: "PDF файлыг нээж чадсангүй.",
          groupId,
        },
      ),
    [commitProject, runAsyncOperation],
  );

  const exportProject = useCallback(
    (): string =>
      runSyncOperation(() => serializeProject(projectRef.current)),
    [runSyncOperation],
  );

  const downloadProject = useCallback(
    (fileName?: string): void => {
      runSyncOperation(() =>
        downloadProjectJson(projectRef.current, fileName),
      );
    },
    [runSyncOperation],
  );

  const importProject = useCallback(
    (source: ProjectImportSource): Promise<PdfProject> =>
      runAsyncOperation(
        async ({ assertCurrent }) => {
          const importedProject = await readImportSource(source);
          // Imports preserve their own group names. Mark old portable exports
          // as reviewed so the local-only readiness migration does not rename
          // them on the next reload.
          const imported = {
            ...importedProject,
            readinessTemplateVersion:
              importedProject.readinessTemplateVersion ??
              READINESS_TEMPLATE_VERSION,
          };
          assertCurrent();
          const previous = projectRef.current;
          const committed = commitProject(() => imported);
          await deleteProjectPdfBlobs(previous.id).catch(() => undefined);
          return committed;
        },
        {
          code: "PROJECT_IMPORT_FAILED",
          message: "Project файлыг нээж чадсангүй.",
        },
      ),
    [commitProject, runAsyncOperation],
  );

  const selectedGroup = useMemo(
    () => project.groups.find((group) => group.id === project.selectedGroupId),
    [project.groups, project.selectedGroupId],
  );

  return {
    project,
    groups: project.groups,
    selectedGroup,
    selectedGroupId: project.selectedGroupId,
    isHydrated,
    hydrated: isHydrated,
    isBusy: pendingOperations > 0,
    error,
    clearError,
    selectGroup,
    addGroup,
    addGroups,
    newProject,
    createNewProject: newProject,
    renameProject,
    renameGroup,
    updateGroupNote,
    setGroupNote: updateGroupNote,
    setGroupStatus,
    attachPdf,
    replacePdf: attachPdf,
    removePdf,
    duplicateGroup,
    deleteGroup,
    reorderGroups,
    updateLastViewedPage,
    getPdfBlob,
    retrievePdfBlob: getPdfBlob,
    exportProject,
    downloadProject,
    saveProject: downloadProject,
    importProject,
    openProject: importProject,
  };
}

export default useProject;
