"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ClipboardIcon,
  CopyIcon,
  MessageSquarePlusIcon,
  ScissorsIcon,
  ShapesIcon,
  SparklesIcon,
  TextSelectIcon,
  WandSparklesIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface EditorContextMenuState {
  x: number;
  y: number;
  hasSelection: boolean;
  isTex: boolean;
  isTikzBlock: boolean;
}

interface EditorContextMenuProps {
  menu: EditorContextMenuState | null;
  onClose: () => void;
  onOpenTikzStudio: () => void;
  onOpenFigureStudio: () => void;
  onAskAi: () => void;
  onAddComment: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSelectAll: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  disabled = false,
  accent = false,
  onClick,
}: {
  icon: typeof ShapesIcon;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "hover:bg-accent hover:text-accent-foreground",
        accent && !disabled && "font-medium text-primary",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", accent ? "text-primary" : "text-muted-foreground")} />
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="ml-3 font-mono text-[0.65rem] text-muted-foreground">
          {shortcut}
        </span>
      )}
    </button>
  );
}

export function EditorContextMenu({
  menu,
  onClose,
  onOpenTikzStudio,
  onOpenFigureStudio,
  onAskAi,
  onAddComment,
  onCut,
  onCopy,
  onPaste,
  onSelectAll,
}: EditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown);
    }, 0);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", onClose);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", onClose);
    };
  }, [menu, onClose]);

  if (!menu || typeof document === "undefined") return null;

  const menuWidth = 240;
  const menuHeight = 290;
  const left = clamp(menu.x, 8, Math.max(8, window.innerWidth - menuWidth - 8));
  const top = clamp(menu.y, 8, Math.max(8, window.innerHeight - menuHeight - 8));

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Editor context menu"
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-[90] w-60 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-[0_14px_40px_rgba(0,0,0,0.18)]"
    >
      {menu.isTex && (
        <>
          <MenuItem
            icon={ShapesIcon}
            label={
              menu.isTikzBlock
                ? "Edit Figure in TikZ Studio"
                : "Open TikZ Studio"
            }
            accent={menu.isTikzBlock}
            onClick={() => {
              onClose();
              onOpenTikzStudio();
            }}
          />
          <MenuItem
            icon={WandSparklesIcon}
            label="Scientific Figure Studio"
            onClick={() => {
              onClose();
              onOpenFigureStudio();
            }}
          />
          <div className="my-1 h-px bg-border" />
        </>
      )}

      {menu.hasSelection && (
        <>
          <MenuItem
            icon={SparklesIcon}
            label="Ask AI about selection"
            onClick={() => {
              onClose();
              onAskAi();
            }}
          />
          <MenuItem
            icon={MessageSquarePlusIcon}
            label="Add Comment"
            onClick={() => {
              onClose();
              onAddComment();
            }}
          />
          <div className="my-1 h-px bg-border" />
        </>
      )}

      <MenuItem
        icon={ScissorsIcon}
        label="Cut"
        shortcut="⌘X"
        disabled={!menu.hasSelection}
        onClick={() => {
          onClose();
          onCut();
        }}
      />
      <MenuItem
        icon={CopyIcon}
        label="Copy"
        shortcut="⌘C"
        disabled={!menu.hasSelection}
        onClick={() => {
          onClose();
          onCopy();
        }}
      />
      <MenuItem
        icon={ClipboardIcon}
        label="Paste"
        shortcut="⌘V"
        onClick={() => {
          onClose();
          onPaste();
        }}
      />
      <div className="my-1 h-px bg-border" />
      <MenuItem
        icon={TextSelectIcon}
        label="Select All"
        shortcut="⌘A"
        onClick={() => {
          onClose();
          onSelectAll();
        }}
      />
    </div>,
    document.body,
  );
}
