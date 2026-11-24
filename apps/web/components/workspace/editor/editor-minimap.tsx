"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import {
  classifyMinimapLine,
  computeMinimapGeometry,
  MINIMAP_LINE_STRIDE,
  MINIMAP_MAX_COLUMNS,
  type MinimapFileKind,
  type MinimapGeometry,
  type MinimapTokenRole,
  scrollTopForMinimapY,
} from "@/lib/minimap-layout";
import { cn } from "@/lib/utils";

export interface EditorMinimapDiagnostic {
  line: number;
  severity: "error" | "warning" | "info";
}

export interface EditorMinimapColors {
  background: string;
  foreground: string;
  border: string;
  comment: string;
  keyword: string;
  string: string;
  accent: string;
  cursor: string;
  selection: string;
  invalid: string;
}

interface EditorMinimapProps {
  editorView: EditorView | null;
  content: string;
  fileKind: MinimapFileKind;
  cursorLine: number;
  diagnostics: EditorMinimapDiagnostic[];
  colors: EditorMinimapColors;
  dark: boolean;
}

const HORIZONTAL_PADDING = 8;
const RIGHT_GUTTER_PADDING = 8;
const GLYPH_HEIGHT = 2;
const SECTION_GLYPH_HEIGHT = 2.5;

export function EditorMinimap({
  editorView,
  content,
  fileKind,
  cursorLine,
  diagnostics,
  colors,
  dark,
}: EditorMinimapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const geometryRef = useRef<MinimapGeometry>({
    contentHeight: 0,
    minimapScrollTop: 0,
    sliderTop: 0,
    sliderHeight: 0,
    maxSliderTop: 0,
    maxEditorScroll: 0,
    scrollRatio: 0,
  });
  const dragRef = useRef<{
    pointerId: number;
    offsetY: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const tokenizedLines = useMemo(() => {
    const rawLines = content.split("\n");
    return rawLines.map((line) => classifyMinimapLine(line, fileKind));
  }, [content, fileKind]);

  const diagnosticsByLine = useMemo(() => {
    const map = new Map<number, "error" | "warning" | "info">();
    const rank = { error: 3, warning: 2, info: 1 } as const;
    for (const diag of diagnostics) {
      if (!Number.isFinite(diag.line) || diag.line <= 0) continue;
      const existing = map.get(diag.line);
      if (!existing || rank[diag.severity] > rank[existing]) {
        map.set(diag.line, diag.severity);
      }
    }
    return map;
  }, [diagnostics]);

  const roleStyle = useMemo(
    (): Record<MinimapTokenRole, { color: string; alpha: number }> => ({
      section: { color: colors.accent, alpha: 0.92 },
      command: { color: colors.keyword, alpha: 0.75 },
      math: { color: colors.string, alpha: 0.78 },
      comment: { color: colors.comment, alpha: 0.48 },
      text: { color: colors.foreground, alpha: 0.42 },
    }),
    [colors],
  );

  const paintMinimap = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.round(width * dpr);
    const targetH = Math.round(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scroller = editorView?.scrollDOM;
    const scrollTop = scroller?.scrollTop ?? 0;
    const scrollHeight = scroller?.scrollHeight ?? height;
    const clientHeight = scroller?.clientHeight ?? height;

    const geometry = computeMinimapGeometry({
      lineCount: tokenizedLines.length,
      containerHeight: height,
      scrollTop,
      scrollHeight,
      clientHeight,
    });
    geometryRef.current = geometry;

    if (sliderRef.current) {
      sliderRef.current.style.height = `${Math.max(0, geometry.sliderHeight)}px`;
      sliderRef.current.style.transform = `translate3d(0, ${geometry.sliderTop}px, 0)`;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const drawWidth = Math.max(
      12,
      width - HORIZONTAL_PADDING - RIGHT_GUTTER_PADDING,
    );
    const colWidth = drawWidth / MINIMAP_MAX_COLUMNS;

    const firstVisibleLine = Math.max(
      0,
      Math.floor(geometry.minimapScrollTop / MINIMAP_LINE_STRIDE) - 1,
    );
    const lastVisibleLine = Math.min(
      tokenizedLines.length - 1,
      Math.ceil((geometry.minimapScrollTop + height) / MINIMAP_LINE_STRIDE) + 1,
    );

    // Paint cursor line highlight
    const cursorIdx = cursorLine - 1;
    if (cursorIdx >= firstVisibleLine && cursorIdx <= lastVisibleLine) {
      const cursorY =
        cursorIdx * MINIMAP_LINE_STRIDE - geometry.minimapScrollTop;
      ctx.save();
      ctx.globalAlpha = dark ? 0.24 : 0.16;
      ctx.fillStyle = colors.accent;
      ctx.fillRect(0, cursorY - 0.5, width, MINIMAP_LINE_STRIDE);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = colors.cursor || colors.accent;
      ctx.fillRect(0, cursorY, 2, MINIMAP_LINE_STRIDE);
      ctx.restore();
    }

    // Paint visible code micro-bars
    for (let idx = firstVisibleLine; idx <= lastVisibleLine; idx += 1) {
      const y = idx * MINIMAP_LINE_STRIDE - geometry.minimapScrollTop;
      const segments = tokenizedLines[idx];

      if (segments && segments.length > 0) {
        if (segments[0]?.role === "section") {
          ctx.save();
          ctx.globalAlpha = dark ? 0.12 : 0.08;
          ctx.fillStyle = colors.accent;
          ctx.fillRect(0, y - 0.5, width, MINIMAP_LINE_STRIDE + 0.5);
          ctx.restore();
        }

        for (const segment of segments) {
          const style = roleStyle[segment.role];
          const x = HORIZONTAL_PADDING + segment.startCol * colWidth;
          const barW = Math.max(1.5, segment.length * colWidth);
          const barH =
            segment.role === "section" ? SECTION_GLYPH_HEIGHT : GLYPH_HEIGHT;
          ctx.globalAlpha = style.alpha;
          ctx.fillStyle = style.color;
          ctx.fillRect(x, y, barW, barH);
        }
      }

      const severity = diagnosticsByLine.get(idx + 1);
      if (severity) {
        ctx.globalAlpha = 0.95;
        ctx.fillStyle =
          severity === "error"
            ? colors.invalid || "#e06c75"
            : severity === "warning"
              ? "#e8a55a"
              : "#5db8a6";
        ctx.fillRect(width - 5, y, 4, MINIMAP_LINE_STRIDE);
      }
    }

    ctx.globalAlpha = 1;
  }, [
    colors.accent,
    colors.cursor,
    colors.invalid,
    cursorLine,
    dark,
    diagnosticsByLine,
    editorView,
    roleStyle,
    tokenizedLines,
  ]);

  const schedulePaint = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      paintMinimap();
    });
  }, [paintMinimap]);

  useEffect(() => {
    schedulePaint();
  }, [schedulePaint]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scroller = editorView?.scrollDOM ?? null;
    const handleScroll = () => {
      schedulePaint();
    };

    scroller?.addEventListener("scroll", handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      schedulePaint();
    });
    resizeObserver.observe(container);
    if (scroller) {
      resizeObserver.observe(scroller);
    }

    const handleWheel = (event: WheelEvent) => {
      if (!scroller) return;
      event.preventDefault();
      scroller.scrollTop += event.deltaY;
      schedulePaint();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      scroller?.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);
      resizeObserver.disconnect();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [editorView, schedulePaint]);

  const applyScrollAtPointer = useCallback(
    (clientY: number, offsetY: number) => {
      const container = containerRef.current;
      const scroller = editorView?.scrollDOM;
      if (!container || !scroller) return;

      const rect = container.getBoundingClientRect();
      const pointerY = clientY - rect.top;
      scroller.scrollTop = scrollTopForMinimapY(
        pointerY,
        offsetY,
        geometryRef.current,
      );
      schedulePaint();
    },
    [editorView, schedulePaint],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !containerRef.current || !editorView) return;
    event.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const pointerY = event.clientY - rect.top;
    const geometry = geometryRef.current;

    const insideSlider =
      pointerY >= geometry.sliderTop &&
      pointerY <= geometry.sliderTop + geometry.sliderHeight;
    const offsetY = insideSlider
      ? pointerY - geometry.sliderTop
      : geometry.sliderHeight / 2;

    dragRef.current = { pointerId: event.pointerId, offsetY };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (!insideSlider) {
      applyScrollAtPointer(event.clientY, offsetY);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    applyScrollAtPointer(event.clientY, drag.offsetY);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      ref={containerRef}
      aria-label="Code minimap"
      role="scrollbar"
      aria-orientation="vertical"
      aria-controls="latex-editor-scroller"
      aria-valuenow={Math.round(geometryRef.current.scrollRatio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        "group relative hidden h-full w-[88px] shrink-0 select-none overflow-hidden border-l sm:block",
        isDragging ? "cursor-grabbing" : "cursor-pointer",
      )}
      style={{
        backgroundColor: colors.background,
        borderLeftColor: colors.border,
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div
        ref={sliderRef}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 rounded-[2px] border-y transition-colors",
          dark
            ? isDragging
              ? "border-white/20 bg-white/18"
              : "border-white/12 bg-white/10 group-hover:bg-white/15"
            : isDragging
              ? "border-black/18 bg-black/14"
              : "border-black/10 bg-black/8 group-hover:bg-black/12",
        )}
        style={{ height: 0 }}
      />
    </div>
  );
}
