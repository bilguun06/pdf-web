"use client";

import {
  FilePlus2,
  Files,
  FolderOpen,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface HeaderProps {
  onNewProject: () => void;
  onSaveProject: () => void;
  onOpenProject: () => void;
  isSaving?: boolean;
  disabled?: boolean;
}

export function Header({
  onNewProject,
  onSaveProject,
  onOpenProject,
  isSaving = false,
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

        <Button
          size="sm"
          variant="secondary"
          onClick={onSaveProject}
          disabled={disabled}
          loading={isSaving}
          aria-label={isSaving ? "Төсөл хадгалж байна" : "Төсөл хадгалах"}
          title="Төсөл хадгалах (Ctrl+S)"
          className="px-2.5 md:px-3"
        >
          {!isSaving ? <Save aria-hidden="true" className="size-4" /> : null}
          <span className="hidden md:inline">{isSaving ? "Хадгалж байна" : "Хадгалах"}</span>
        </Button>

        <Button
          size="sm"
          variant="secondary"
          onClick={onOpenProject}
          disabled={disabled}
          aria-label="Төсөл нээх"
          title="Төсөл нээх"
          className="px-2.5 md:px-3"
        >
          <FolderOpen aria-hidden="true" className="size-4" />
          <span className="hidden md:inline">Нээх</span>
        </Button>

      </nav>
    </header>
  );
}
