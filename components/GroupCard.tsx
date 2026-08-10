"use client";

import {
  AlertTriangle,
  Copy,
  FileX2,
  GripVertical,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { clsx } from "clsx";
import type { CSSProperties } from "react";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/ActionMenu";

export type GroupCardStatus = "empty" | "ready" | "loading" | "missing" | "error";

export interface GroupCardData {
  id: string;
  name: string;
  fileName?: string | null;
  pageCount?: number;
  status?: GroupCardStatus;
  error?: string | null;
}

export interface GroupCardProps {
  group: GroupCardData;
  ordinal: number;
  active: boolean;
  onSelect: (groupId: string) => void;
  onRename?: (groupId: string) => void;
  onReplacePdf?: (groupId: string) => void;
  onRemovePdf?: (groupId: string) => void;
  onDuplicate?: (groupId: string) => void;
  onDelete?: (groupId: string) => void;
  dragDisabled?: boolean;
  disabled?: boolean;
}

function groupStatus(group: GroupCardData): GroupCardStatus {
  if (group.status) return group.status;
  if (group.error) return "error";
  return group.fileName ? "ready" : "empty";
}

export function GroupCard({
  group,
  ordinal,
  active,
  onSelect,
  onRename,
  onReplacePdf,
  onRemovePdf,
  onDuplicate,
  onDelete,
  dragDisabled = false,
  disabled = false,
}: GroupCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id, disabled: dragDisabled || disabled });

  const status = groupStatus(group);
  const hasPdf = Boolean(group.fileName);
  const defaultName = `Бүлэг ${ordinal}`;
  const displayName = group.name.trim() || defaultName;
  const structuredNameSeparator = displayName.indexOf("_");
  const structuredCode =
    structuredNameSeparator > 0
      ? displayName.slice(0, structuredNameSeparator)
      : undefined;
  const structuredDescription =
    structuredNameSeparator > 0
      ? displayName.slice(structuredNameSeparator + 1).trim()
      : undefined;
  const cardTitle =
    structuredDescription && structuredCode ? structuredCode : displayName;
  const subtitle =
    group.fileName ||
    structuredDescription ||
    (displayName === defaultName ? "PDF файлгүй" : defaultName);
  const pageCount = Math.max(0, group.pageCount ?? 0);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  const select = () => {
    if (!disabled) onSelect(group.id);
  };

  const menuItems: ActionMenuItem[] = [
    {
      label: "Нэр өөрчлөх",
      icon: Pencil,
      onSelect: () => onRename?.(group.id),
      disabled: !onRename,
    },
    {
      label: hasPdf ? "PDF солих" : "PDF оруулах",
      icon: RefreshCw,
      onSelect: () => onReplacePdf?.(group.id),
      disabled: !onReplacePdf,
    },
    {
      label: "PDF устгах",
      icon: FileX2,
      onSelect: () => onRemovePdf?.(group.id),
      disabled: !hasPdf || !onRemovePdf,
    },
    {
      label: "Бүлгийг хувилах",
      icon: Copy,
      separatorBefore: true,
      onSelect: () => onDuplicate?.(group.id),
      disabled: !onDuplicate,
    },
    {
      label: "Бүлгийг устгах",
      icon: Trash2,
      destructive: true,
      onSelect: () => onDelete?.(group.id),
      disabled: !onDelete,
    },
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative flex h-[112px] w-[300px] shrink-0 select-none flex-col rounded-2xl border bg-[var(--surface)] px-3.5 py-3 text-left transition-[border-color,box-shadow,background-color,opacity] duration-150",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_6px_22px_color-mix(in_srgb,var(--accent)_16%,transparent)]"
          : "border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-sm",
        isDragging && "opacity-55 shadow-xl",
        disabled && "pointer-events-none opacity-55",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={`${displayName}${pageCount ? `, ${pageCount} хуудас` : ", PDF оруулаагүй"}`}
        data-group-tab={group.id}
        tabIndex={active ? 0 : -1}
        disabled={disabled}
        onClick={select}
        className="absolute inset-0 z-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:cursor-not-allowed"
      >
        <span className="sr-only">{displayName} бүлгийг нээх</span>
      </button>

      <div className="pointer-events-none relative z-10 flex min-w-0 items-start gap-1.5">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          disabled={dragDisabled || disabled}
          tabIndex={active ? 0 : -1}
          aria-label={`${displayName} бүлгийг зөөх`}
          onClick={(event) => event.stopPropagation()}
          className="pointer-events-auto -ml-2 -mt-1 inline-flex size-8 shrink-0 touch-none items-center justify-center rounded-lg text-[var(--text-muted)] opacity-40 outline-none transition-opacity hover:bg-[var(--surface-muted)] hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:hidden sm:cursor-grab sm:active:cursor-grabbing"
        >
          <GripVertical aria-hidden="true" className="size-4" />
        </button>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-sm font-bold leading-5 text-[var(--text)]" title={displayName}>
            {cardTitle}
          </p>
          <p className="mt-0.5 truncate text-xs leading-5 text-[var(--text-muted)]" title={subtitle}>
            {subtitle}
          </p>
        </div>

        <ActionMenu
          items={menuItems}
          disabled={disabled}
          triggerTabIndex={active ? 0 : -1}
          label={`${displayName} бүлгийн үйлдлүүд`}
          className="pointer-events-auto -mr-1 -mt-1 shrink-0"
        />
      </div>

      <div className="pointer-events-none relative z-10 mt-auto flex min-w-0 items-center justify-between gap-2 pl-6">
        <div
          className={clsx(
            "flex min-w-0 items-center gap-1.5 text-[11px] font-semibold",
            status === "error"
              ? "text-[var(--danger)]"
              : status === "missing"
                ? "text-[var(--warning)]"
              : status === "ready" || active
                ? "text-[var(--success)]"
                : "text-[var(--text-muted)]",
          )}
          title={group.error || undefined}
        >
          {status === "loading" ? (
            <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
          ) : status === "error" || status === "missing" ? (
            <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
          ) : (
            <span
              aria-hidden="true"
              className={clsx(
                "size-2 shrink-0 rounded-full border",
                active
                  ? "border-[var(--accent)] bg-[var(--accent)]"
                  : hasPdf
                    ? "border-[var(--success)] bg-[var(--success)]"
                    : "border-[var(--border-strong)] bg-transparent",
              )}
            />
          )}
          <span className="truncate">
            {status === "loading"
              ? "Уншиж байна"
              : status === "error"
                ? "PDF алдаатай"
                : status === "missing"
                  ? "PDF дахин сонгоно уу"
                : active
                  ? "Нээлттэй"
                  : hasPdf
                    ? "Бэлэн"
                    : "PDF оруулаагүй"}
          </span>
        </div>
        {hasPdf && pageCount > 0 ? (
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
            {pageCount.toLocaleString("mn-MN")} хуудас
          </span>
        ) : null}
      </div>
    </div>
  );
}
