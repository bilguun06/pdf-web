"use client";

import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { clsx } from "clsx";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export interface ActionMenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  label?: string;
  disabled?: boolean;
  className?: string;
  triggerTabIndex?: number;
}

export function ActionMenu({
  items,
  label = "Үйлдлийн цэс",
  disabled = false,
  className,
  triggerTabIndex,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnFocusOutside = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")?.focus();
      }
    };
    const closeOnViewportChange = () => setOpen(false);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOnFocusOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOnFocusOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  const moveFocus = (direction: 1 | -1) => {
    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [],
    );
    if (!buttons.length) return;
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const menuWidth = 224;
      const estimatedHeight = Math.min(320, items.length * 42 + 24);
      const left = Math.min(
        window.innerWidth - menuWidth - 8,
        Math.max(8, rect.right - menuWidth),
      );
      const top =
        rect.bottom + estimatedHeight + 8 <= window.innerHeight
          ? rect.bottom + 6
          : Math.max(8, rect.top - estimatedHeight - 6);
      setPosition({ left, top });
    }
    setOpen(true);
    window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    });
  };

  const handleMenuKeys = (event: ReactKeyboardEvent) => {
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      menuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    }
  };

  return (
    <>
      <div
        ref={rootRef}
        className={clsx("relative", className)}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleMenuKeys}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          tabIndex={triggerTabIndex}
          disabled={disabled}
          onClick={toggleMenu}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-40"
        >
          <MoreHorizontal aria-hidden="true" className="size-5" />
        </button>
      </div>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              style={position}
              onKeyDown={handleMenuKeys}
              className="animate-in fixed z-[110] max-h-[min(320px,calc(100vh-16px))] w-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow)]"
            >
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    role="none"
                    className={
                      item.separatorBefore
                        ? "mt-1 border-t border-[var(--border)] pt-1"
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        setOpen(false);
                        triggerRef.current?.focus();
                        item.onSelect();
                      }}
                      className={clsx(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] disabled:pointer-events-none disabled:opacity-40",
                        item.destructive
                          ? "text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                          : "text-[var(--text)] hover:bg-[var(--surface-muted)]",
                      )}
                    >
                      {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
                      <span>{item.label}</span>
                    </button>
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
