"use client";

import {
  CloudUpload,
  FilePlus2,
  Files,
  FolderOpen,
  Save,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface HeaderProps {
  onNewProject?: () => void;
  onSaveProject?: () => void;
  onOpenProject?: () => void;
  onCloudSave?: () => void;
  onShare?: () => void;
  isSaving?: boolean;
  isCloudSaving?: boolean;
  cloudReady?: boolean;
  cloudProgress?: number;
  disabled?: boolean;
}

export function Header({
  onNewProject,
  onSaveProject,
  onOpenProject,
  onCloudSave,
  onShare,
  isSaving = false,
  isCloudSaving = false,
  cloudReady = false,
  cloudProgress,
  disabled = false,
}: HeaderProps) {
  return (
    <header className="relative z-40 flex min-h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 sm:px-5 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-sm"
          role="img"
          aria-label="PDF Group Manager"
          title="PDF Group Manager"
        >
          <Files aria-hidden="true" className="size-5" />
        </div>
      </div>

      <nav aria-label="Төслийн үйлдлүүд" className="flex shrink-0 items-center gap-1 sm:gap-2">
        {onNewProject ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onNewProject}
            disabled={disabled}
            aria-label="Шинэ төсөл"
            title="Шинэ төсөл"
            className="px-2.5 md:px-3"
          >
            <FilePlus2 aria-hidden="true" className="size-4" />
            <span className="hidden lg:inline">Шинэ төсөл</span>
          </Button>
        ) : null}

        {onSaveProject ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onSaveProject}
            disabled={disabled}
            loading={isSaving}
            aria-label={isSaving ? "Төсөл хадгалж байна" : "Төслийг JSON файлаар хадгалах"}
            title="Local JSON хадгалах (Ctrl+S)"
            className="px-2.5 md:px-3"
          >
            {!isSaving ? <Save aria-hidden="true" className="size-4" /> : null}
            <span className="hidden xl:inline">{isSaving ? "Хадгалж байна" : "Local JSON"}</span>
          </Button>
        ) : null}

        {onOpenProject ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onOpenProject}
            disabled={disabled}
            aria-label="Төсөл нээх"
            title="Local төсөл нээх"
            className="px-2.5 md:px-3"
          >
            <FolderOpen aria-hidden="true" className="size-4" />
            <span className="hidden xl:inline">Нээх</span>
          </Button>
        ) : null}

        {onCloudSave ? (
          <Button
            size="sm"
            variant="primary"
            onClick={onCloudSave}
            disabled={disabled}
            loading={isCloudSaving}
            aria-label={isCloudSaving ? "Cloud-д хадгалж байна" : "Cloud-д хадгалах"}
            title={cloudReady ? "Cloud төслийг шинэчлэх" : "Cloud-д хадгалах"}
            className="px-2.5 md:px-3"
          >
            {!isCloudSaving ? <CloudUpload aria-hidden="true" className="size-4" /> : null}
            <span className="hidden md:inline">
              {isCloudSaving
                ? `${Math.max(0, Math.min(100, Math.round(cloudProgress ?? 0)))}%`
                : cloudReady
                  ? "Cloud шинэчлэх"
                  : "Cloud-д хадгалах"}
            </span>
          </Button>
        ) : null}

        {onShare ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={onShare}
            disabled={disabled || !cloudReady}
            aria-label="Төсөл хуваалцах"
            title={cloudReady ? "Share холбоос авах" : "Эхлээд cloud-д хадгална уу"}
            className="px-2.5 md:px-3"
          >
            <Share2 aria-hidden="true" className="size-4" />
            <span className="hidden md:inline">Share</span>
          </Button>
        ) : null}

      </nav>
    </header>
  );
}
