"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { GroupCard, type GroupCardData } from "@/components/GroupCard";

export interface GroupTabsProps {
  groups: readonly GroupCardData[];
  selectedGroupId?: string | null;
  onSelectGroup: (groupId: string) => void;
  onReorder?: (activeId: string, overId: string) => void;
  onAddGroup: () => void;
  onRenameGroup?: (groupId: string) => void;
  onReplacePdf?: (groupId: string) => void;
  onRemovePdf?: (groupId: string) => void;
  onDuplicateGroup?: (groupId: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  disabled?: boolean;
}

export function GroupTabs({
  groups,
  selectedGroupId,
  onSelectGroup,
  onReorder,
  onAddGroup,
  onRenameGroup,
  onReplacePdf,
  onRemovePdf,
  onDuplicateGroup,
  onDeleteGroup,
  disabled = false,
}: GroupTabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || !onReorder) return;
    onReorder(String(active.id), String(over.id));
  };

  useEffect(() => {
    if (!selectedGroupId) return;
    const frame = window.requestAnimationFrame(() => {
      const tabs = tabListRef.current?.querySelectorAll<HTMLButtonElement>("[data-group-tab]");
      const activeTab = tabs
        ? Array.from(tabs).find((tab) => tab.dataset.groupTab === selectedGroupId)
        : undefined;
      activeTab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [groups.length, selectedGroupId]);

  return (
    <section
      aria-label="PDF бүлгүүд"
      className="border-b border-[var(--border)] bg-[var(--surface-muted)]"
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3 sm:px-5 lg:px-6">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
            Бүлгүүд
          </h2>
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[var(--text-muted)]">
            {groups.length}
          </span>
        </div>
        {groups.length > 1 && onReorder ? (
          <p className="hidden text-[11px] text-[var(--text-muted)] sm:block">
            Бариулаас чирж эрэмбэлнэ
          </p>
        ) : null}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="PDF бүлэг сонгох"
          onKeyDown={(event) => {
            const target = event.target as HTMLElement;
            if (target.getAttribute("role") !== "tab") return;
            const tabs = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']:not(:disabled)"),
            );
            const currentIndex = tabs.indexOf(target as HTMLButtonElement);
            if (currentIndex < 0) return;

            let nextIndex: number | undefined;
            if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
            if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            if (event.key === "Home") nextIndex = 0;
            if (event.key === "End") nextIndex = tabs.length - 1;
            if (nextIndex === undefined) return;

            event.preventDefault();
            tabs[nextIndex]?.focus();
            tabs[nextIndex]?.click();
          }}
          className="flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto px-4 pb-4 sm:px-5 lg:px-6"
        >
          <SortableContext
            items={groups.map((group) => group.id)}
            strategy={horizontalListSortingStrategy}
          >
            {groups.map((group, index) => (
              <div key={group.id} role="presentation" className="snap-start">
                <GroupCard
                  group={group}
                  ordinal={index + 1}
                  active={selectedGroupId === group.id}
                  onSelect={onSelectGroup}
                  onRename={onRenameGroup}
                  onReplacePdf={onReplacePdf}
                  onRemovePdf={onRemovePdf}
                  onDuplicate={onDuplicateGroup}
                  onDelete={onDeleteGroup}
                  dragDisabled={!onReorder || groups.length < 2}
                  disabled={disabled}
                />
              </div>
            ))}
          </SortableContext>

          <button
            type="button"
            onClick={onAddGroup}
            disabled={disabled}
            className="flex h-[112px] w-[184px] shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] text-sm font-bold text-[var(--text-muted)] outline-none transition-[border-color,background-color,color] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="flex size-8 items-center justify-center rounded-full border border-current">
              <Plus aria-hidden="true" className="size-4" />
            </span>
            Бүлэг нэмэх
          </button>
        </div>
      </DndContext>
    </section>
  );
}
