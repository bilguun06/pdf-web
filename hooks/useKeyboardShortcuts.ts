"use client";

import { useEffect } from "react";

interface KeyboardShortcutOptions {
  enabled?: boolean;
  onOpenPdf?: () => void;
  onSaveProject?: () => void;
  onPreviousPage?: () => void;
  onNextPage?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onFocusGoToPage?: () => void;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function useKeyboardShortcuts({
  enabled = true,
  onOpenPdf,
  onSaveProject,
  onPreviousPage,
  onNextPage,
  onZoomIn,
  onZoomOut,
  onFocusGoToPage,
}: KeyboardShortcutOptions) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const modifier = event.ctrlKey || event.metaKey;
      const editable = isEditableTarget(event.target);
      const key = event.key.toLowerCase();

      if (modifier && key === "o" && onOpenPdf) {
        event.preventDefault();
        onOpenPdf();
        return;
      }

      if (modifier && key === "s" && onSaveProject) {
        event.preventDefault();
        onSaveProject();
        return;
      }

      if (modifier && key === "g" && onFocusGoToPage) {
        event.preventDefault();
        onFocusGoToPage();
        return;
      }

      if (modifier && (event.key === "+" || event.key === "=") && onZoomIn) {
        event.preventDefault();
        onZoomIn();
        return;
      }

      if (modifier && event.key === "-" && onZoomOut) {
        event.preventDefault();
        onZoomOut();
        return;
      }

      if (editable || modifier || event.altKey || event.shiftKey) return;

      if (event.key === "ArrowLeft" && onPreviousPage) {
        event.preventDefault();
        onPreviousPage();
      } else if (event.key === "ArrowRight" && onNextPage) {
        event.preventDefault();
        onNextPage();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    enabled,
    onFocusGoToPage,
    onNextPage,
    onOpenPdf,
    onPreviousPage,
    onSaveProject,
    onZoomIn,
    onZoomOut,
  ]);
}
