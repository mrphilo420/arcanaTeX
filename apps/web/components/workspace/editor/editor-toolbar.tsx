"use client";

import { RefObject, useRef, useState } from "react";
import { toast } from "sonner";
import { EditorView } from "@codemirror/view";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  BoldIcon,
  ChevronDownIcon,
  CodeIcon,
  EyeIcon,
  FileCodeIcon,
  FileTextIcon,
  FunctionSquareIcon,
  Heading1Icon,
  Heading2Icon,
  ImageIcon,
  ItalicIcon,
  KeyboardIcon,
  ListIcon,
  LoaderIcon,
  MinusIcon,
  PaletteIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  ScanTextIcon,
  ShieldCheckIcon,
  TypeIcon,
  WrenchIcon,
} from "lucide-react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  recomputeProjectLintNow,
  useActiveFileLint,
} from "@/hooks/use-project-lint";
import { TERMINAL_THEMES } from "@/lib/editor-theme";
import { fileKindLabel, type FileKind } from "@/lib/file-kind";
import {
  applyAllSafeLintFixes,
  applyLintFix,
  lintLatexProject,
  type LatexLintIssue,
} from "@/lib/latex-linter";
import { recognizeImage } from "@/lib/ocr";
import { MONO_FONTS } from "@/lib/mono-fonts";
import { isLatexDocumentFile } from "@/lib/project-files";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { useEditorPreferencesStore } from "@/stores/editor-preferences-store";

function ToolbarAppearanceButton({ className }: { className?: string }) {
  const themeId = useEditorPreferencesStore((s) => s.terminalThemeId);
  const monoFontId = useEditorPreferencesStore((s) => s.monoFontId);
  const setAppearanceOpen = useEditorPreferencesStore(
    (s) => s.setAppearanceOpen,
  );
  const activeTheme =
    TERMINAL_THEMES.find((theme) => theme.id === themeId) ?? TERMINAL_THEMES[0];
  const activeFont =
    MONO_FONTS.find((font) => font.id === monoFontId) ?? MONO_FONTS[0];

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "size-7 text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
      onClick={() => setAppearanceOpen(true)}
      title={`Appearance studio · ${activeTheme.label} · ${activeFont.label}`}
      aria-label="Appearance"
    >
      <PaletteIcon className="size-3.5" />
    </Button>
  );
}

function PrecisionLintMenu({
  editorView,
}: {
  editorView: RefObject<EditorView | null>;
}) {
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const activeFileName = useDocumentStore(
    (s) => s.files.find((item) => item.id === s.activeFileId)?.name ?? "document.tex",
  );
  const isDocFile = useDocumentStore((s) => {
    const file = s.files.find((item) => item.id === s.activeFileId);
    return Boolean(file && isLatexDocumentFile(file));
  });
  const updateFileContent = useDocumentStore((s) => s.updateFileContent);
  const requestJumpToPosition = useDocumentStore(
    (s) => s.requestJumpToPosition,
  );

  const [open, setOpen] = useState(false);
  const lintState = useActiveFileLint();

  if (!activeFileId || !isDocFile) return null;

  const isSynced = lintState.fileId === activeFileId;
  const issues = isSynced ? lintState.issues : [];
  const errors = isSynced ? lintState.errors : 0;
  const warnings = isSynced ? lintState.warnings : 0;
  const infos = isSynced ? lintState.infos : 0;
  const fixableCount = issues.filter((issue) => Boolean(issue.fix)).length;

  const jumpToIssue = (issue: LatexLintIssue) => {
    const view = editorView.current;
    if (view) {
      const target = Math.min(Math.max(0, issue.start), view.state.doc.length);
      view.dispatch({
        selection: { anchor: target },
        effects: EditorView.scrollIntoView(target, { y: "center" }),
      });
      view.focus();
    } else {
      requestJumpToPosition(issue.start);
    }
    setOpen(false);
  };

  const applySingleFix = (issue: LatexLintIssue) => {
    const state = useDocumentStore.getState();
    const latestFile = state.files.find((f) => f.id === activeFileId);
    if (!latestFile) return;

    const latestContent = latestFile.content ?? "";
    let targetIssue: LatexLintIssue | undefined = issue;
    if (latestContent !== lintState.contentSnapshot) {
      const freshReport = lintLatexProject(state.files, latestFile.path);
      targetIssue = freshReport.activeIssues.find(
        (candidate) =>
          candidate.code === issue.code &&
          candidate.message === issue.message &&
          candidate.snippet === issue.snippet &&
          Boolean(candidate.fix),
      );
    }
    if (!targetIssue?.fix) {
      toast.info("This issue has already changed; re-checking file.");
      return;
    }

    const updated = applyLintFix(latestContent, targetIssue);
    if (updated !== latestContent) {
      updateFileContent(latestFile.id, updated);
      recomputeProjectLintNow();
      toast.success(`Applied ${targetIssue.code} fix`);
    }
  };

  const handleFixAllSafe = () => {
    const state = useDocumentStore.getState();
    const latestFile = state.files.find((f) => f.id === activeFileId);
    if (!latestFile) return;

    const latestContent = latestFile.content ?? "";
    const freshIssues =
      latestContent === lintState.contentSnapshot
        ? issues
        : lintLatexProject(state.files, latestFile.path).activeIssues;
    const safeFixCount = freshIssues.filter((item) => Boolean(item.fix)).length;
    if (safeFixCount === 0) return;

    const updated = applyAllSafeLintFixes(latestContent, freshIssues);
    if (updated !== latestContent) {
      updateFileContent(latestFile.id, updated);
      recomputeProjectLintNow();
      toast.success(
        `Applied ${safeFixCount} safe lint ${safeFixCount === 1 ? "fix" : "fixes"}`,
      );
    }
  };

  const hasAlerts = errors > 0 || warnings > 0;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={hasAlerts ? "sm" : "icon"}
          className={cn(
            hasAlerts
              ? "h-6 shrink-0 gap-1.5 rounded-full border border-hairline bg-background/70 px-2 text-[0.72rem] text-foreground hover:border-primary/40"
              : "size-7 shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          title={
            hasAlerts
              ? `Precision Lint: ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`
              : infos > 0
                ? `Precision Lint: clean (${infos} note${infos === 1 ? "" : "s"})`
                : "Precision LaTeX static lint & quick-fixes (clean)"
          }
          aria-label="Precision Lint"
        >
          {errors > 0 ? (
            <AlertCircleIcon className="size-3.5 text-destructive" />
          ) : warnings > 0 ? (
            <AlertTriangleIcon className="size-3.5 text-amber-500" />
          ) : (
            <ShieldCheckIcon className="size-3.5 text-emerald-500/85" />
          )}
          {hasAlerts && (
            <span className="flex items-center gap-1 font-mono text-[0.65rem]">
              {errors > 0 && (
                <span className="rounded bg-destructive/15 px-1 text-destructive">
                  {errors}E
                </span>
              )}
              {warnings > 0 && (
                <span className="rounded bg-amber-500/15 px-1 text-amber-600 dark:text-amber-400">
                  {warnings}W
                </span>
              )}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-96 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="min-w-0">
            <div className="font-medium text-xs">Precision Lint</div>
            <div className="truncate font-mono text-[0.65rem] text-muted-foreground">
              {errors} errors · {warnings} warnings · {infos} notes
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-6 shrink-0 gap-1 text-[0.68rem]"
            disabled={fixableCount === 0}
            onClick={handleFixAllSafe}
          >
            <WrenchIcon className="size-3" />
            <span>Fix all safe ({fixableCount})</span>
          </Button>
        </div>

        <div className="max-h-72 divide-y divide-border/60 overflow-y-auto">
          {issues.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-4 text-muted-foreground text-xs">
              <ShieldCheckIcon className="size-4 shrink-0 text-emerald-500" />
              <span>No static lint issues found in {activeFileName}.</span>
            </div>
          ) : (
            issues.map((issue) => (
              <div
                key={issue.id}
                className="flex items-start gap-2 px-3 py-2 hover:bg-accent/50"
              >
                <button
                  type="button"
                  onClick={() => jumpToIssue(issue)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded px-1 py-0.5 font-medium font-mono text-[0.625rem]",
                        issue.severity === "error"
                          ? "bg-destructive/15 text-destructive"
                          : issue.severity === "warning"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {issue.code}
                    </span>
                    <span className="font-mono text-[0.65rem] text-muted-foreground">
                      L{issue.line}:{issue.column}
                    </span>
                    <span className="truncate text-[0.65rem] text-muted-foreground capitalize">
                      {issue.category}
                    </span>
                  </div>
                  <p className="mt-0.5 text-foreground text-xs leading-snug">
                    {issue.message}
                  </p>
                  {issue.suggestion && (
                    <p className="mt-0.5 truncate text-[0.68rem] text-muted-foreground">
                      {issue.suggestion}
                    </p>
                  )}
                </button>
                {issue.fix && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="mt-0.5 h-6 shrink-0 px-2 text-[0.68rem]"
                    title={issue.fix.label}
                    onClick={() => applySingleFix(issue)}
                  >
                    Fix
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ZOOM_OPTIONS = [
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%" },
  { value: "1.25", label: "125%" },
  { value: "1.5", label: "150%" },
  { value: "2", label: "200%" },
  { value: "3", label: "300%" },
  { value: "4", label: "400%" },
];

interface EditorToolbarProps {
  editorView: RefObject<EditorView | null>;
  fileType?: "tex" | "image" | "binary";
  fileKind?: FileKind;
  imageScale?: number;
  markdownPreview?: boolean;
  markdownPreviewAvailable?: boolean;
  onToggleMarkdownPreview?: () => void;
  onImageScaleChange?: (scale: number) => void;
}

export function EditorToolbar({
  editorView,
  fileType = "tex",
  fileKind = "latex",
  imageScale = 1,
  markdownPreview = false,
  markdownPreviewAvailable = true,
  onToggleMarkdownPreview,
  onImageScaleChange,
}: EditorToolbarProps) {
  const fileName = useDocumentStore((s) => {
    const activeFile = s.files.find((f) => f.id === s.activeFileId);
    return activeFile?.path ?? "document.tex";
  });
  const isLatexKeyboardOpen = useDocumentStore((s) => s.isLatexKeyboardOpen);
  const setLatexKeyboardOpen = useDocumentStore((s) => s.setLatexKeyboardOpen);

  const insertText = (before: string, after: string = "") => {
    const view = editorView.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);

    view.dispatch({
      changes: {
        from,
        to,
        insert: before + selectedText + after,
      },
      selection: {
        anchor: from + before.length,
        head: from + before.length + selectedText.length,
      },
    });
    view.focus();
  };

  const scanInput = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);

  const scanImage = async (file: File) => {
    setScanning(true);
    try {
      const text = await recognizeImage(file);
      if (!text) {
        toast.info("No text found in that image.");
        return;
      }
      insertText(`${text}\n`);
      toast.success("Inserted recognized text. Review it before compiling.");
    } catch (error) {
      console.error("Image OCR failed", error);
      toast.error("Could not read that image.");
    } finally {
      setScanning(false);
    }
  };

  const wrapSelection = (wrapper: string) => {
    insertText(wrapper, wrapper);
  };

  const zoomIn = () => onImageScaleChange?.(Math.min(4, imageScale + 0.25));
  const zoomOut = () => onImageScaleChange?.(Math.max(0.25, imageScale - 0.25));

  if (fileType === "image" || fileType === "binary") {
    return (
      <div className="no-scrollbar flex h-9 items-center justify-between overflow-x-auto border-hairline border-b bg-card px-2 text-muted-foreground [&_button:hover]:bg-accent [&_button:hover]:text-foreground">
        <div className="flex items-center gap-1">
          {fileType === "image" ? (
            <ImageIcon className="size-4 text-muted-foreground" />
          ) : (
            <FileTextIcon className="size-4 text-muted-foreground" />
          )}
          <span className="font-medium font-mono text-[0.875rem] text-foreground">
            {fileName}
          </span>
        </div>
        {fileType === "image" && (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={zoomOut}
              disabled={imageScale <= 0.25}
            >
              <MinusIcon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={zoomIn}
              disabled={imageScale >= 4}
            >
              <PlusIcon className="size-3.5" />
            </Button>
            <Select
              value={imageScale.toString()}
              onValueChange={(v) => onImageScaleChange?.(Number(v))}
            >
              <SelectTrigger size="sm" className="h-6! w-auto text-xs">
                <SelectValue>{Math.round(imageScale * 100)}%</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ZOOM_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {fileType === "binary" && (
          <span className="text-muted-foreground text-xs">binary</span>
        )}
      </div>
    );
  }

  if (fileKind !== "latex" && fileKind !== "markdown" && fileKind !== "lean") {
    const isCode = fileKind === "python" || fileKind === "r";
    const runLabel =
      fileKind === "python" ? "Run Python" : fileKind === "r" ? "Run R" : null;
    return (
      <div className="flex h-9 items-center gap-2 border-hairline border-b bg-card px-2 text-muted-foreground">
        {isCode ? (
          <FileCodeIcon className="size-4 text-[#5db8a6]" />
        ) : (
          <FileTextIcon className="size-4 text-[#e8a55a]" />
        )}
        <span className="font-medium font-mono text-[0.875rem] text-foreground">
          {fileName}
        </span>
        <span className="rounded border border-hairline bg-accent px-1.5 py-0.5 font-mono text-[0.75rem] text-muted-foreground uppercase tracking-[0.12em]">
          {fileKindLabel(fileKind)}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {runLabel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 rounded-full border border-[#5db8a6]/35 bg-[#5db8a6]/10 px-2.5 font-medium text-[#5db8a6] text-[0.72rem] hover:bg-[#5db8a6]/20 hover:text-[#5db8a6]"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("arcanatex:run-code"));
              }}
              title={`${runLabel} script`}
            >
              <PlayIcon className="size-3 fill-current" />
              <span>{runLabel}</span>
            </Button>
          )}
          <ToolbarAppearanceButton />
        </div>
      </div>
    );
  }

  if (fileKind === "markdown") {
    return (
      <div className="flex h-9 items-center gap-2 border-hairline border-b bg-card px-2 text-muted-foreground">
        <FileTextIcon className="size-4 text-[#e8a55a]" />
        <span className="font-medium font-mono text-[0.875rem] text-foreground">
          {fileName}
        </span>
        <span className="rounded border border-[#e8a55a]/30 bg-[#e8a55a]/10 px-1.5 py-0.5 font-mono text-[#e8a55a] text-[0.75rem] uppercase tracking-[0.12em]">
          Markdown
        </span>
        <div className="ml-auto flex items-center gap-1">
          {markdownPreviewAvailable && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-[0.75rem] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={onToggleMarkdownPreview}
            >
              {markdownPreview ? (
                <PencilIcon className="size-3.5" />
              ) : (
                <EyeIcon className="size-3.5" />
              )}
              {markdownPreview ? "Edit" : "Preview"}
            </Button>
          )}
          <ToolbarAppearanceButton />
        </div>
      </div>
    );
  }

  if (fileKind === "lean") {
    return (
      <div className="flex h-9 items-center gap-2 border-hairline border-b bg-card px-2 text-muted-foreground">
        <FileCodeIcon className="size-4 text-[#5db8a6]" />
        <span className="font-medium font-mono text-[0.875rem] text-foreground">
          {fileName}
        </span>
        <span className="rounded border border-[#5db8a6]/30 bg-[#5db8a6]/10 px-1.5 py-0.5 font-mono text-[#5db8a6] text-[0.75rem] uppercase tracking-[0.12em]">
          Lean 4
        </span>
        <div className="ml-auto flex items-center gap-1">
          <ToolbarAppearanceButton />
        </div>
      </div>
    );
  }

  return (
    <div className="no-scrollbar flex h-9 items-center gap-1 overflow-x-auto border-hairline border-b bg-card px-2.5 text-muted-foreground [&_button:hover]:bg-accent [&_button:hover]:text-foreground">
      <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="mr-1 shrink-0 font-medium font-mono text-[0.875rem] text-foreground">
        {fileName}
      </span>
      <div className="mx-1 h-4 w-px shrink-0 bg-border/70" />
      <input
        ref={scanInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void scanImage(file);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-[0.75rem] text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Formatting, document structure, and OCR capture"
          >
            <TypeIcon className="size-3.5" />
            <span>Format</span>
            <ChevronDownIcon className="size-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="text-[0.625rem] text-muted-foreground uppercase tracking-[0.14em]">
            Text
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => insertText("\\textbf{", "}")}>
            <BoldIcon className="size-3.5 text-muted-foreground" />
            <span>Bold</span>
            <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">
              \textbf
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insertText("\\textit{", "}")}>
            <ItalicIcon className="size-3.5 text-muted-foreground" />
            <span>Italic</span>
            <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">
              \textit
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insertText("\\texttt{", "}")}>
            <CodeIcon className="size-3.5 text-muted-foreground" />
            <span>Code</span>
            <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">
              \texttt
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[0.625rem] text-muted-foreground uppercase tracking-[0.14em]">
            Structure
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => insertText("\\section{", "}")}>
            <Heading1Icon className="size-3.5 text-muted-foreground" />
            <span>Section</span>
            <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">
              \section
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insertText("\\subsection{", "}")}>
            <Heading2Icon className="size-3.5 text-muted-foreground" />
            <span>Subsection</span>
            <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">
              \subsection
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => insertText("\\item ")}>
            <ListIcon className="size-3.5 text-muted-foreground" />
            <span>List item</span>
            <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">
              \item
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[0.625rem] text-muted-foreground uppercase tracking-[0.14em]">
            Capture
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => scanInput.current?.click()}
            disabled={scanning}
          >
            {scanning ? (
              <LoaderIcon className="size-3.5 animate-spin text-muted-foreground" />
            ) : (
              <ScanTextIcon className="size-3.5 text-muted-foreground" />
            )}
            <span>{scanning ? "Scanning image..." : "OCR scan"}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipIconButton
        tooltip="Inline math ($...$)"
        onClick={() => wrapSelection("$")}
      >
        <FunctionSquareIcon className="size-4" />
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="Display math (\\[...\\])"
        onClick={() => insertText("\\[\n  ", "\n\\]")}
      >
        <span className="font-mono text-xs">∫</span>
      </TooltipIconButton>
      <TooltipIconButton
        tooltip="LaTeX keyboard (⌘/Ctrl+Shift+K)"
        onClick={() => setLatexKeyboardOpen(!isLatexKeyboardOpen)}
        className={
          isLatexKeyboardOpen ? "bg-accent text-foreground" : undefined
        }
        aria-pressed={isLatexKeyboardOpen}
      >
        <KeyboardIcon className="size-4" />
      </TooltipIconButton>
      <PrecisionLintMenu editorView={editorView} />
      <div className="ml-auto flex items-center gap-1">
        <ToolbarAppearanceButton />
      </div>
    </div>
  );
}
