"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import type { ReactNode } from "react";
import { useTheme } from "next-themes";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { Annotation, Compartment, EditorState, Prec } from "@codemirror/state";
import {
  acceptChunk,
  getChunks,
  goToNextChunk,
  goToPreviousChunk,
  rejectChunk,
  unifiedMergeView,
} from "@codemirror/merge";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  scrollPastEnd,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import {
  search,
  highlightSelectionMatches,
  SearchQuery,
  setSearchQuery as setSearchQueryEffect,
  findNext,
  findPrevious,
} from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { latex } from "codemirror-lang-latex";
import { FileIcon } from "lucide-react";
import { useActiveFileLint } from "@/hooks/use-project-lint";
import { fileKindForFile, languageForFileKind } from "@/lib/file-kind";
import { leanLanguage } from "@/lib/lean-language";
import { normalizeEol } from "@/lib/ai/file-edits";
import { minimalChange } from "@/lib/editor-sync";
import { cn } from "@/lib/utils";
import { useAgentChangesStore } from "@/stores/agent-changes-store";
import { useDocumentStore } from "@/stores/document-store";
import { useDevFeatureFlag } from "@/stores/dev-panel-store";
import { useEditorPreferencesStore } from "@/stores/editor-preferences-store";
import {
  diagnosticHighlightExtension,
  type EditorDiagnosticMark,
  setEditorDiagnostics,
} from "@/lib/editor-diagnostics";
import { buildEditorTheme, getTerminalTheme } from "@/lib/editor-theme";
import { EditorMinimap } from "./editor-minimap";
import { EditorToolbar } from "./editor-toolbar";
import type { LatexInsertion } from "../tikz-latex-ribbon";
import { AIDrawer, ChatPanel } from "./ai-drawer";
import { SelectionChat, type SelectionChatTarget } from "./selection-chat";
import {
  EditorContextMenu,
  type EditorContextMenuState,
} from "./editor-context-menu";
import { findTikzBlock } from "@/lib/tikz";
import { ImagePreview } from "./image-preview";
import { ReviewBar } from "./review-bar";
import { SearchPanel } from "./search-panel";

const TikzLatexRibbon = dynamic(
  () => import("../tikz-latex-ribbon").then((m) => m.TikzLatexRibbon),
  { ssr: false },
);

const MarkdownPreview = dynamic(
  () => import("./markdown-preview").then((m) => m.MarkdownPreview),
  { ssr: false },
);

const syncAnnotation = Annotation.define<boolean>();

const mergeReviewTheme = EditorView.theme({
  ".cm-changedLine": { backgroundColor: "rgba(52, 211, 153, 0.10)" },
  ".cm-inlineChangedLine": { backgroundColor: "rgba(52, 211, 153, 0.08)" },
  ".cm-changedText": {
    backgroundColor: "rgba(52, 211, 153, 0.22)",
    borderRadius: "2px",
  },
  ".cm-changedLineGutter": {
    backgroundColor: "rgba(52, 211, 153, 0.18)",
  },
  ".cm-inlineChangedLineGutter": {
    backgroundColor: "rgba(52, 211, 153, 0.18)",
  },
  ".cm-deletedLine": { backgroundColor: "rgba(248, 113, 113, 0.10)" },
  ".cm-deletedText": {
    backgroundColor: "rgba(248, 113, 113, 0.20)",
    borderRadius: "2px",
  },
  ".cm-deletedLineGutter": {
    backgroundColor: "rgba(248, 113, 113, 0.18)",
  },
});

function readReviewChunks(view: EditorView): {
  current: number;
  total: number;
} {
  const result = getChunks(view.state);
  if (!result || result.chunks.length === 0) {
    return { current: 0, total: 0 };
  }

  const chunks = result.chunks;
  const head = view.state.selection.main.head;
  let index = chunks.findIndex(
    (chunk) => head >= chunk.fromB && head <= chunk.toB,
  );
  if (index === -1) {
    index = chunks.findIndex((chunk) => chunk.fromB > head);
    if (index === -1) index = chunks.length - 1;
  }

  return { current: index + 1, total: chunks.length };
}

function reviewChunkPosition(view: EditorView): number | undefined {
  const result = getChunks(view.state);
  if (!result || result.chunks.length === 0) return undefined;

  const { current } = readReviewChunks(view);
  return result.chunks[Math.max(0, current - 1)]?.fromB;
}

interface StickyItem {
  type: "section" | "begin";
  name: string;
  content: string;
  html: string;
  line: number;
}

interface ParsedLine {
  type: "section" | "begin" | "end";
  name: string;
  content: string;
  line: number;
}

function parseLatexStructure(content: string): ParsedLine[] {
  const lines = content.split("\n");
  const result: ParsedLine[] = [];

  const sectionRegex =
    /\\(part|chapter|section|subsection|subsubsection)\*?\s*\{[^}]*\}/;
  const beginRegex = /\\begin\{([^}]+)\}/;
  const endRegex = /\\end\{([^}]+)\}/;

  lines.forEach((lineContent, index) => {
    const sectionMatch = lineContent.match(sectionRegex);
    if (sectionMatch) {
      result.push({
        type: "section",
        name: sectionMatch[1],
        content: lineContent,
        line: index + 1,
      });
      return;
    }

    const beginMatch = lineContent.match(beginRegex);
    if (beginMatch) {
      result.push({
        type: "begin",
        name: beginMatch[1],
        content: lineContent,
        line: index + 1,
      });
      return;
    }

    const endMatch = lineContent.match(endRegex);
    if (endMatch) {
      result.push({
        type: "end",
        name: endMatch[1],
        content: lineContent,
        line: index + 1,
      });
    }
  });

  return result;
}

function getStickyLines(
  parsedLines: ParsedLine[],
  currentLine: number,
): StickyItem[] {
  const stack: StickyItem[] = [];

  const sectionLevelMap: Record<string, number> = {
    part: 0,
    chapter: 1,
    section: 2,
    subsection: 3,
    subsubsection: 4,
  };

  for (const item of parsedLines) {
    if (item.line > currentLine) break;

    if (item.type === "section") {
      const level = sectionLevelMap[item.name] ?? 2;
      while (
        stack.length > 0 &&
        stack[stack.length - 1].type === "section" &&
        sectionLevelMap[stack[stack.length - 1].name] >= level
      ) {
        stack.pop();
      }
      stack.push({
        type: "section",
        name: item.name,
        content: item.content,
        html: "",
        line: item.line,
      });
    } else if (item.type === "begin") {
      stack.push({
        type: "begin",
        name: item.name,
        content: item.content,
        html: "",
        line: item.line,
      });
    } else if (item.type === "end") {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].type === "begin" && stack[i].name === item.name) {
          stack.splice(i, 1);
          break;
        }
      }
    }
  }

  return stack;
}

function getActiveFileContent(): string {
  const state = useDocumentStore.getState();
  const activeFile = state.files.find((f) => f.id === state.activeFileId);
  return activeFile?.content ?? "";
}

function ChatDock({ children }: { children: ReactNode }) {
  const isThreadOpen = useDocumentStore((s) => s.isThreadOpen);
  const setThreadOpen = useDocumentStore((s) => s.setThreadOpen);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const lastChatSizeRef = useRef(40);

  useEffect(() => {
    const stored = Number(
      window.localStorage.getItem("arcana-editor-chat-size"),
    );
    if (Number.isFinite(stored) && stored >= 15 && stored <= 70) {
      lastChatSizeRef.current = stored;
    }
  }, []);

  useEffect(() => {
    if (isThreadOpen) {
      chatPanelRef.current?.expand(lastChatSizeRef.current);
      return;
    }
    const size = chatPanelRef.current?.getSize() ?? 0;
    if (size > 0) lastChatSizeRef.current = size;
    chatPanelRef.current?.collapse();
  }, [isThreadOpen]);

  return (
    <PanelGroup
      direction="vertical"
      autoSaveId="arcana-editor-chat"
      className="min-h-0 flex-1"
    >
      <Panel id="editor" order={1} minSize={25}>
        <div className="relative h-full min-h-0 overflow-hidden">
          {children}
        </div>
      </Panel>
      <PanelResizeHandle
        className={cn(
          "group relative h-2 bg-transparent",
          !isThreadOpen && "hidden",
        )}
      >
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border transition-colors group-hover:bg-primary/50 group-data-[resize-handle-state=drag]:bg-primary/70" />
      </PanelResizeHandle>
      <Panel
        ref={chatPanelRef}
        id="chat"
        order={2}
        defaultSize={0}
        minSize={15}
        maxSize={70}
        collapsible
        collapsedSize={0}
        onResize={(size) => {
          if (size > 0) {
            lastChatSizeRef.current = size;
            try {
              window.localStorage.setItem(
                "arcana-editor-chat-size",
                String(size),
              );
            } catch {
              // Private mode or a full quota: the in-memory size still works.
            }
          }
        }}
        onCollapse={() => setThreadOpen(false)}
        onExpand={() => setThreadOpen(true)}
      >
        <ChatPanel />
      </Panel>
    </PanelGroup>
  );
}

export function LatexEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const activeFile = useDocumentStore((s) =>
    s.files.find((f) => f.id === s.activeFileId),
  );
  const setContent = useDocumentStore((s) => s.setContent);
  const setCursorPosition = useDocumentStore((s) => s.setCursorPosition);
  const setSelectionRange = useDocumentStore((s) => s.setSelectionRange);
  const compileDiagnostics = useDocumentStore((s) => s.compileDiagnostics);
  const jumpToPosition = useDocumentStore((s) => s.jumpToPosition);
  const clearJumpRequest = useDocumentStore((s) => s.clearJumpRequest);
  const isLatexKeyboardOpen = useDocumentStore((s) => s.isLatexKeyboardOpen);
  const setLatexKeyboardOpen = useDocumentStore((s) => s.setLatexKeyboardOpen);
  const reviewTurnId = useAgentChangesStore((s) => s.reviewTurnId);
  const reviewFileId = useAgentChangesStore((s) => s.reviewFileId);
  const agentChanges = useAgentChangesStore((s) => s.changes);
  const stopReview = useAgentChangesStore((s) => s.stopReview);
  const markdownPreviewEnabled = useDevFeatureFlag("markdownPreview");
  const showMinimap = useEditorPreferencesStore((state) => state.showMinimap);
  const terminalThemeId = useEditorPreferencesStore(
    (state) => state.terminalThemeId,
  );
  // The default "Arcana" theme follows the app's light/dark mode. In light
  // mode the editor uses the paper palette instead of the dark terminal one,
  // so the workspace reads as a single material.
  const { resolvedTheme } = useTheme();
  const editorThemeId =
    terminalThemeId === "arcana" && resolvedTheme !== "dark"
      ? ("arcana-paper" as const)
      : terminalThemeId;
  const terminalTheme = useMemo(
    () => buildEditorTheme(editorThemeId),
    [editorThemeId],
  );
  const resolvedTerminalTheme = useMemo(
    () => getTerminalTheme(editorThemeId),
    [editorThemeId],
  );
  const editorColors = resolvedTerminalTheme.colors;

  const isTexFile = activeFile?.type === "tex";
  const activeKind = activeFile ? fileKindForFile(activeFile) : "other";
  const activeLanguage = languageForFileKind(activeKind);
  const isLean = activeKind === "lean";
  const isMarkdown = activeKind === "markdown";
  const isLatex = activeKind === "latex";
  const activeFileContent = activeFile?.content;
  const mergeCompartmentRef = useRef<Compartment>(new Compartment());
  const mergeCompartment = mergeCompartmentRef.current;
  const [reviewChunks, setReviewChunks] = useState({ current: 0, total: 0 });
  const reviewBaseline = useMemo(() => {
    if (
      !reviewTurnId ||
      !reviewFileId ||
      !activeFile ||
      activeFile.id !== reviewFileId
    ) {
      return null;
    }

    const first = agentChanges.find(
      (change) =>
        change.turnId === reviewTurnId && change.fileId === reviewFileId,
    );
    return first ? normalizeEol(first.before) : null;
  }, [reviewTurnId, reviewFileId, activeFile, agentChanges]);
  const compileMarks = useMemo<EditorDiagnosticMark[]>(() => {
    if (!activeFile || !isLatex) return [];
    const path = activeFile.path.replace(/\\/g, "/");
    const basename = path.split("/").pop();
    const relevant = compileDiagnostics.filter((diagnostic) => {
      if (diagnostic.fileId) return diagnostic.fileId === activeFile.id;
      if (!diagnostic.filePath) return true;
      const diagnosticPath = diagnostic.filePath.replace(/\\/g, "/");
      return (
        diagnosticPath === path ||
        (!diagnosticPath.includes("/") && diagnosticPath === basename)
      );
    });
    const marks: EditorDiagnosticMark[] = [];
    const lines = (activeFile.content ?? "").split("\n");

    for (const diagnostic of relevant) {
      if (typeof diagnostic.line === "number" && diagnostic.line > 0) {
        marks.push({
          line: diagnostic.line,
          severity: diagnostic.severity,
          message: diagnostic.message,
        });
      }

      // An environment mismatch is reported at the closing token, but the
      // opening block is part of the repair, so highlight it too when present.
      if (diagnostic.kind === "environment-mismatch" && diagnostic.data.begin) {
        const marker = `\\begin{${diagnostic.data.begin}}`;
        lines.forEach((lineText, index) => {
          if (lineText.includes(marker)) {
            marks.push({
              line: index + 1,
              severity: diagnostic.severity,
              message: diagnostic.message,
            });
          }
        });
      }
    }

    return marks;
  }, [activeFile, compileDiagnostics, isLatex]);

  const activeLint = useActiveFileLint();

  const activeFileMarks = useMemo<EditorDiagnosticMark[]>(() => {
    const lintMarks =
      activeFile && activeLint.fileId === activeFile.id ? activeLint.marks : [];
    return [...compileMarks, ...lintMarks];
  }, [compileMarks, activeFile, activeLint.fileId, activeLint.marks]);

  const [imageScale, setImageScale] = useState(0.5);
  const [currentLine, setCurrentLine] = useState(1);
  const [cursorLine, setCursorLine] = useState(1);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [selectionChat, setSelectionChat] =
    useState<SelectionChatTarget | null>(null);
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(
    null,
  );
  const [gutterWidth, setGutterWidth] = useState(0);
  const [lineHtmlCache, setLineHtmlCache] = useState<Record<number, string>>(
    {},
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [markdownPreview, setMarkdownPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);

  const parsedLines = useMemo(
    () =>
      isLean || isMarkdown ? [] : parseLatexStructure(activeFileContent ?? ""),
    [activeFileContent, isLean, isMarkdown],
  );

  const stickyLines = useMemo(() => {
    const items = getStickyLines(parsedLines, currentLine);
    return items.map((item) => ({
      ...item,
      html: lineHtmlCache[item.line] || "",
    }));
  }, [parsedLines, currentLine, lineHtmlCache]);

  useEffect(() => {
    useEditorPreferencesStore.getState().hydrate();
  }, []);

  useEffect(() => {
    setMarkdownPreview(false);
    setSelectionChat(null);
    setContextMenu(null);
  }, [activeFileId]);

  useEffect(() => {
    if (!markdownPreviewEnabled) setMarkdownPreview(false);
  }, [markdownPreviewEnabled]);

  const compileRef = useRef<() => void>(() => {});
  const isSearchOpenRef = useRef(false);

  const insertFromKeyboard = useCallback((insertion: LatexInsertion) => {
    const view = viewRef.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const text = `${insertion.before}${selected}${insertion.after ?? ""}`;
    const caret = insertion.after
      ? selected.length > 0
        ? from +
          insertion.before.length +
          selected.length +
          insertion.after.length
        : from + insertion.before.length
      : from + insertion.before.length + selected.length;

    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: caret, head: caret },
      scrollIntoView: true,
    });
    view.focus();
  }, []);

  const refreshReviewChunks = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    const next = readReviewChunks(view);
    setReviewChunks((previous) =>
      previous.current === next.current && previous.total === next.total
        ? previous
        : next,
    );
  }, []);

  const reviewPrevious = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    goToPreviousChunk(view);
    refreshReviewChunks();
    view.focus();
  }, [refreshReviewChunks]);

  const reviewNext = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    goToNextChunk(view);
    refreshReviewChunks();
    view.focus();
  }, [refreshReviewChunks]);

  const reviewAccept = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const position = reviewChunkPosition(view);
    if (position !== undefined) acceptChunk(view, position);
    refreshReviewChunks();
    view.focus();
  }, [refreshReviewChunks]);

  const reviewReject = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const position = reviewChunkPosition(view);
    if (position !== undefined) rejectChunk(view, position);
    refreshReviewChunks();
    view.focus();
  }, [refreshReviewChunks]);

  const reviewClose = useCallback(() => {
    stopReview();
    viewRef.current?.focus();
  }, [stopReview]);

  useEffect(() => {
    isSearchOpenRef.current = isSearchOpen;
  }, [isSearchOpen]);

  useEffect(() => {
    if (!searchQuery || !activeFileContent) {
      setMatchCount(0);
      setCurrentMatch(0);
      return;
    }

    const regex = new RegExp(
      searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "gi",
    );
    const matches = activeFileContent.match(regex);
    setMatchCount(matches?.length ?? 0);
    if (matches && matches.length > 0) {
      setCurrentMatch(1);
    } else {
      setCurrentMatch(0);
    }
  }, [searchQuery, activeFileContent]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      if (
        isLatex &&
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        setLatexKeyboardOpen(!isLatexKeyboardOpen);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLatex, isLatexKeyboardOpen, setLatexKeyboardOpen]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const query = new SearchQuery({
      search: searchQuery,
      caseSensitive: false,
      literal: true,
    });

    view.dispatch({
      effects: setSearchQueryEffect.of(query),
    });

    if (searchQuery) {
      findNext(view);
    }
  }, [searchQuery]);

  const findNextRef = useRef<(view: EditorView) => void>(() => {});
  const findPreviousRef = useRef<(view: EditorView) => void>(() => {});

  const runFindNext = (view: EditorView) => {
    findNext(view);
    // The counter was previously pinned to 1. Advance it with the selection
    // so "3 of 7" reflects where the caret actually is.
    setCurrentMatch((current) =>
      matchCount === 0 ? 0 : (current % matchCount) + 1,
    );
  };

  const runFindPrevious = (view: EditorView) => {
    findPrevious(view);
    setCurrentMatch((current) =>
      matchCount === 0 ? 0 : current <= 1 ? matchCount : current - 1,
    );
  };

  findNextRef.current = runFindNext;
  findPreviousRef.current = runFindPrevious;

  const handleFindNext = () => {
    const view = viewRef.current;
    if (!view) return;
    runFindNext(view);
  };

  const handleFindPrevious = () => {
    const view = viewRef.current;
    if (!view) return;
    runFindPrevious(view);
  };

  compileRef.current = () => {
    if (!isLatex) return;
    useDocumentStore.getState().requestCompile();
  };

  useEffect(() => {
    if (!containerRef.current || !isTexFile) return;

    const currentContent = getActiveFileContent();

    const updateListener = EditorView.updateListener.of((update) => {
      const isSyncTransaction = update.transactions.some((transaction) =>
        transaction.annotation(syncAnnotation),
      );

      if (update.docChanged && !isSyncTransaction) {
        setContent(update.state.doc.toString());
      }
      if (update.selectionSet || update.docChanged) {
        const { from, to, head } = update.state.selection.main;
        setCursorLine(update.state.doc.lineAt(head).number);
        if (update.selectionSet) {
          setCursorPosition(head);
          if (from !== to) {
            setSelectionRange({ start: from, end: to });
            const selected = update.state.sliceDoc(from, to);
            const coords =
              update.view.coordsAtPos(to) ?? update.view.coordsAtPos(from);
            if (selected.trim() && coords) {
              setSelectionChat({
                text: selected,
                startLine: update.state.doc.lineAt(from).number,
                endLine: update.state.doc.lineAt(Math.max(from, to - 1)).number,
                top: coords.bottom + 8,
                left: coords.left,
              });
            } else {
              setSelectionChat(null);
            }
          } else {
            setSelectionRange(null);
            setSelectionChat(null);
          }
        }
      }

      refreshReviewChunks();
    });

    const scrollListener = EditorView.domEventHandlers({
      scroll: (_, view) => {
        setSelectionChat(null);
        const scrollTop = view.scrollDOM.scrollTop;
        const lineBlock = view.lineBlockAtHeight(scrollTop);
        const lineNumber = view.state.doc.lineAt(lineBlock.from).number;
        setCurrentLine(lineNumber);

        const gutter = view.dom.querySelector(".cm-gutters");
        if (gutter) {
          setGutterWidth(gutter.getBoundingClientRect().width);
        }

        const cmLines = view.dom.querySelectorAll(".cm-line");
        const newCache: Record<number, string> = {};
        cmLines.forEach((el) => {
          const lineInfo = view.lineBlockAt(
            view.posAtDOM(el as HTMLElement, 0),
          );
          const ln = view.state.doc.lineAt(lineInfo.from).number;
          newCache[ln] = el.innerHTML;
        });
        setLineHtmlCache((prev) => ({ ...prev, ...newCache }));
      },
    });

    const compileKeymap = Prec.highest(
      keymap.of([
        {
          key: "Enter",
          run: (view) => {
            if (isSearchOpenRef.current) {
              findNextRef.current(view);
              return true;
            }
            // Fall through to the default newline binding.
            return false;
          },
        },
        {
          key: "Shift-Enter",
          run: (view) => {
            if (isSearchOpenRef.current) {
              findPreviousRef.current(view);
              return true;
            }
            return insertNewlineAndIndent(view);
          },
        },
        {
          key: "Mod-Enter",
          run: () => {
            if (!isLatex) return false;
            compileRef.current();
            return true;
          },
        },
        {
          key: "Mod-s",
          run: () => {
            const { setIsSaving } = useDocumentStore.getState();
            setIsSaving(true);
            setTimeout(() => setIsSaving(false), 1000);
            return true;
          },
        },
        {
          key: "Mod-f",
          run: () => {
            if (isMarkdown) setMarkdownPreview(false);
            setIsSearchOpen(true);
            return true;
          },
        },
        {
          key: "Escape",
          run: () => {
            if (isSearchOpenRef.current) {
              setIsSearchOpen(false);
              return true;
            }
            return false;
          },
        },
      ]),
    );

    const state = EditorState.create({
      doc: currentContent,
      extensions: [
        compileKeymap,
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        isLean
          ? leanLanguage
          : isMarkdown
            ? markdown()
            : isLatex
              ? latex()
              : [],
        terminalTheme.theme,
        syntaxHighlighting(terminalTheme.highlight),
        diagnosticHighlightExtension,
        search(),
        highlightSelectionMatches(),
        mergeCompartment.of([]),
        mergeReviewTheme,
        updateListener,
        scrollListener,
        EditorView.lineWrapping,
        scrollPastEnd(),
        EditorView.theme({
          "&": {
            height: "100%",
            fontFamily: "var(--ui-mono)",
            fontSize: "0.9375rem",
          },
          ".cm-scroller": {
            overflow: "auto",
          },
          ".cm-gutters": {
            paddingRight: "4px",
          },
          ".cm-lineNumbers .cm-gutterElement": {
            paddingLeft: "8px",
            paddingRight: "4px",
          },
          ".cm-content": {
            paddingLeft: "8px",
            paddingRight: "12px",
          },
          ".cm-diagnostic-info": {
            backgroundColor: "rgba(93, 184, 166, 0.08)",
            boxShadow: "inset 2px 0 0 rgba(93, 184, 166, 0.75)",
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    view.scrollDOM.id = "latex-editor-scroller";

    viewRef.current = view;
    setEditorView(view);
    setCursorLine(1);

    return () => {
      view.destroy();
      viewRef.current = null;
      setEditorView(null);
    };
  }, [
    activeFileId,
    isTexFile,
    isLean,
    isMarkdown,
    terminalTheme,
    setContent,
    setCursorPosition,
    setSelectionRange,
    refreshReviewChunks,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: setEditorDiagnostics.of(activeFileMarks),
    });
  }, [activeFileMarks, activeFileId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isTexFile) return;

    const change = minimalChange(
      view.state.doc.toString(),
      activeFileContent ?? "",
    );
    if (!change) return;

    view.dispatch({
      changes: change,
      annotations: syncAnnotation.of(true),
    });
  }, [activeFileContent, isTexFile]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !isTexFile) return;

    if (reviewBaseline === null) {
      view.dispatch({ effects: mergeCompartment.reconfigure([]) });
      setReviewChunks((previous) =>
        previous.current === 0 && previous.total === 0
          ? previous
          : { current: 0, total: 0 },
      );
      return;
    }

    setMarkdownPreview(false);
    view.dispatch({
      effects: mergeCompartment.reconfigure(
        unifiedMergeView({
          original: reviewBaseline,
          mergeControls: false,
          gutter: true,
          highlightChanges: true,
          allowInlineDiffs: false,
          collapseUnchanged: { margin: 3, minSize: 4 },
        }),
      ),
    });

    const firstChunk = getChunks(view.state)?.chunks[0];
    if (firstChunk) {
      view.dispatch({
        selection: { anchor: firstChunk.fromB, head: firstChunk.fromB },
        effects: EditorView.scrollIntoView(firstChunk.fromB, {
          y: "center",
        }),
      });
    }

    refreshReviewChunks();
    const frame = requestAnimationFrame(refreshReviewChunks);
    return () => cancelAnimationFrame(frame);
  }, [
    reviewBaseline,
    activeFileId,
    isTexFile,
    mergeCompartment,
    refreshReviewChunks,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || jumpToPosition === null) return;
    if (isMarkdown) setMarkdownPreview(false);

    view.dispatch({
      selection: { anchor: jumpToPosition },
      effects: EditorView.scrollIntoView(jumpToPosition, { y: "center" }),
    });
    view.focus();
    clearJumpRequest();
  }, [jumpToPosition, clearJumpRequest, isMarkdown]);

  if (!isTexFile && activeFile) {
    const isImage = activeFile.type === "image";

    return (
      <div className="flex h-full flex-col bg-background">
        <EditorToolbar
          editorView={viewRef}
          fileType={isImage ? "image" : "binary"}
          imageScale={imageScale}
          onImageScaleChange={setImageScale}
        />
        <ChatDock>
          {isImage ? (
            <ImagePreview file={activeFile} scale={imageScale} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-muted/30 p-8 text-center">
              <FileIcon className="mb-3 size-10 text-muted-foreground/60" />
              <p className="font-medium text-sm">{activeFile.path}</p>
              <p className="mt-1 max-w-sm text-muted-foreground text-xs">
                This binary file is included when the project compiles, but it
                cannot be edited as text.
              </p>
            </div>
          )}
          <AIDrawer />
        </ChatDock>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <EditorToolbar
        editorView={viewRef}
        fileKind={activeKind}
        markdownPreview={markdownPreview}
        markdownPreviewAvailable={markdownPreviewEnabled}
        onToggleMarkdownPreview={() => {
          if (reviewBaseline !== null) return;
          setMarkdownPreview((value) => !value);
        }}
      />
      {isLatexKeyboardOpen && isLatex && (
        <TikzLatexRibbon scope="workspace" onInsert={insertFromKeyboard} />
      )}
      {isSearchOpen && (
        <SearchPanel
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onClose={() => {
            setIsSearchOpen(false);
            setSearchQuery("");
            viewRef.current?.focus();
          }}
          onFindNext={handleFindNext}
          onFindPrevious={handleFindPrevious}
          matchCount={matchCount}
          currentMatch={currentMatch}
        />
      )}
      {reviewBaseline !== null && (
        <ReviewBar
          current={reviewChunks.current}
          total={reviewChunks.total}
          onPrevious={reviewPrevious}
          onNext={reviewNext}
          onAccept={reviewAccept}
          onReject={reviewReject}
          onClose={reviewClose}
        />
      )}
      <ChatDock>
        <div
          className={cn(
            "absolute inset-0 flex",
            isMarkdown && markdownPreview && markdownPreviewEnabled && "hidden",
          )}
        >
          <div className="relative min-w-0 flex-1">
            {stickyLines.length > 0 && (
              <div
                className="absolute inset-x-0 top-0 z-10 border-b font-mono text-[1rem] leading-[1.4] shadow-md"
                style={{
                  backgroundColor: editorColors.background,
                  borderBottomColor: editorColors.border,
                  color: editorColors.foreground,
                }}
              >
                {stickyLines.map((section) => (
                  <div
                    key={section.line}
                    className="flex cursor-pointer items-center hover:bg-white/5"
                    onClick={() => {
                      const view = viewRef.current;
                      if (!view) return;
                      const line = view.state.doc.line(section.line);
                      view.dispatch({
                        selection: { anchor: line.from },
                        effects: EditorView.scrollIntoView(line.from, {
                          y: "start",
                        }),
                      });
                      view.focus();
                    }}
                  >
                    <span
                      className="shrink-0 py-px text-right"
                      style={{
                        width: gutterWidth ? gutterWidth - 8 : 32,
                        backgroundColor: editorColors.background,
                        color: editorColors.gutter,
                      }}
                    >
                      {section.line}
                    </span>
                    {section.html ? (
                      <span
                        className="py-px pl-5.5"
                        dangerouslySetInnerHTML={{ __html: section.html }}
                      />
                    ) : (
                      <span
                        className="py-px pl-5.5"
                        style={{ color: editorColors.comment }}
                      >
                        {section.content}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div
              ref={containerRef}
              className="absolute inset-0"
              onContextMenu={(event) => {
                event.preventDefault();
                const view = viewRef.current;
                if (!view) return;
                const { from, to } = view.state.selection.main;
                let targetPos = from;
                if (from === to) {
                  const coordsPos = view.posAtCoords({
                    x: event.clientX,
                    y: event.clientY,
                  });
                  if (coordsPos !== null) {
                    targetPos = coordsPos;
                    view.dispatch({ selection: { anchor: coordsPos } });
                    setCursorPosition(coordsPos);
                  }
                }
                const docText = view.state.doc.toString();
                const isTikzBlock =
                  isLatex && findTikzBlock(docText, targetPos) !== null;
                setContextMenu({
                  x: event.clientX,
                  y: event.clientY,
                  hasSelection: from !== to,
                  isTex: isLatex,
                  isTikzBlock,
                });
              }}
            />
          </div>
          {showMinimap && (
            <EditorMinimap
              editorView={editorView}
              content={activeFileContent ?? ""}
              fileKind={
                activeKind === "latex" ||
                activeKind === "markdown" ||
                activeKind === "lean"
                  ? activeKind
                  : "other"
              }
              cursorLine={cursorLine}
              diagnostics={activeFileMarks}
              colors={editorColors}
              dark={resolvedTerminalTheme.dark}
            />
          )}
        </div>
        {isMarkdown && markdownPreview && markdownPreviewEnabled && (
          <MarkdownPreview content={activeFileContent ?? ""} />
        )}
        <AIDrawer />
        <SelectionChat
          target={selectionChat}
          filePath={activeFile?.path ?? "document.tex"}
          language={activeLanguage}
          onClose={() => setSelectionChat(null)}
        />
        <EditorContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onOpenTikzStudio={() => {
            useDocumentStore.getState().setTikzOpen(true);
          }}
          onOpenFigureStudio={() => {
            useDocumentStore.getState().setFigureStudioOpen(true);
          }}
          onAskAi={() => {
            const view = viewRef.current;
            if (!view) return;
            const { from, to } = view.state.selection.main;
            if (from === to) return;
            const selected = view.state.sliceDoc(from, to);
            const coords = view.coordsAtPos(to) ?? view.coordsAtPos(from);
            if (selected.trim() && coords) {
              setSelectionChat({
                text: selected,
                startLine: view.state.doc.lineAt(from).number,
                endLine: view.state.doc.lineAt(Math.max(from, to - 1)).number,
                top: coords.bottom + 8,
                left: coords.left,
              });
            }
          }}
          onAddComment={() => {
            const view = viewRef.current;
            if (!view) return;
            const { from, to } = view.state.selection.main;
            if (from === to) return;
            const selected = view.state.sliceDoc(from, to);
            const line = view.state.doc.lineAt(from).number;
            const state = useDocumentStore.getState();
            state.addComment({
              fileId: activeFile?.id,
              line,
              selectedText: selected,
              body: selected.slice(0, 120),
            });
            state.setCommentsOpen(true);
          }}
          onCut={() => {
            const view = viewRef.current;
            if (!view) return;
            const { from, to } = view.state.selection.main;
            if (from === to) return;
            const text = view.state.sliceDoc(from, to);
            void navigator.clipboard.writeText(text);
            view.dispatch({
              changes: { from, to, insert: "" },
            });
            view.focus();
          }}
          onCopy={() => {
            const view = viewRef.current;
            if (!view) return;
            const { from, to } = view.state.selection.main;
            if (from === to) return;
            const text = view.state.sliceDoc(from, to);
            void navigator.clipboard.writeText(text);
            view.focus();
          }}
          onPaste={() => {
            const view = viewRef.current;
            if (!view) return;
            void navigator.clipboard
              .readText()
              .then((text) => {
                if (!text) return;
                const { from, to } = view.state.selection.main;
                view.dispatch({
                  changes: { from, to, insert: text },
                  selection: { anchor: from + text.length },
                });
                view.focus();
              })
              .catch(() => {});
          }}
          onSelectAll={() => {
            const view = viewRef.current;
            if (!view) return;
            view.dispatch({
              selection: { anchor: 0, head: view.state.doc.length },
            });
            view.focus();
          }}
        />
      </ChatDock>
    </div>
  );
}
