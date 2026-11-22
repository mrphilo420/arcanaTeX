"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  BookMarkedIcon,
  BookOpenIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CompassIcon,
  CrosshairIcon,
  FileCheck2Icon,
  FileCodeIcon,
  KeyboardIcon,
  LayersIcon,
  ListChecksIcon,
  Maximize2Icon,
  Minimize2Icon,
  MonitorIcon,
  MoonIcon,
  PresentationIcon,
  ScanTextIcon,
  ShapesIcon,
  SparklesIcon,
  SunIcon,
  UsersIcon,
  WandSparklesIcon,
} from "lucide-react";
import { ArcanaMark } from "@/components/brand/arcana-mark";
import { DevPanelButton } from "@/components/dev/dev-panel";
import { AppearanceButton } from "@/components/theme/appearance-sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBeamerInfo } from "@/lib/beamer";
import { isLatexRelatedFile } from "@/lib/file-kind";
import { isLeanFile } from "@/lib/lean";
import {
  detectPublisherFromContent,
  type PublisherTemplate,
} from "@/lib/publishers";
import { cn } from "@/lib/utils";
import { useDevFeatureFlag } from "@/stores/dev-panel-store";
import { type InspectorTab, useDocumentStore } from "@/stores/document-store";
import { useEditorPreferencesStore } from "@/stores/editor-preferences-store";

const AgentPanel = dynamic(
  () => import("@/components/workspace/agent-panel").then((m) => m.AgentPanel),
  { ssr: false },
);

interface TopBarDocSummary {
  isBeamer: boolean;
  frameCount: number;
  publisher: PublisherTemplate | null;
}

function readTopBarDocSummary(): TopBarDocSummary {
  const { files, mainFileId, activeFileId } = useDocumentStore.getState();
  const mainFile = files.find((file) => file.id === mainFileId);
  const activeFile = files.find((file) => file.id === activeFileId);
  const beamerInfo = getBeamerInfo(files, mainFileId);
  const publisher = detectPublisherFromContent(
    mainFile?.content ?? activeFile?.content ?? "",
  );
  return {
    isBeamer: beamerInfo.isBeamer,
    frameCount: beamerInfo.frames.length,
    publisher,
  };
}
import { useSyncStore } from "@/stores/sync-store";

const BAR_BUTTON =
  "flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] text-foreground/80 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-45";

function BarButton({
  children,
  onClick,
  title,
  disabled,
  active,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        BAR_BUTTON,
        active && "bg-accent text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function WorkspaceTopBar() {
  const projectName = useDocumentStore((s) => s.projectName);
  const isLeanActive = useDocumentStore((s) => {
    const file = s.files.find((item) => item.id === s.activeFileId);
    return file ? isLeanFile(file) : false;
  });
  const isLatexActive = useDocumentStore((s) => {
    const file = s.files.find((item) => item.id === s.activeFileId);
    return file ? isLatexRelatedFile(file) : false;
  });
  const openCommentCount = useDocumentStore(
    (s) => s.comments.filter((c) => !c.resolved).length,
  );
  const setCommentsOpen = useDocumentStore((s) => s.setCommentsOpen);
  const setLiteratureOpen = useDocumentStore((s) => s.setLiteratureOpen);
  const setJournalOpen = useDocumentStore((s) => s.setJournalOpen);
  const setSyncOpen = useDocumentStore((s) => s.setSyncOpen);
  const setTikzOpen = useDocumentStore((s) => s.setTikzOpen);
  const setFigureStudioOpen = useDocumentStore((s) => s.setFigureStudioOpen);
  const setTextRestorerOpen = useDocumentStore((s) => s.setTextRestorerOpen);
  const setBeamerOpen = useDocumentStore((s) => s.setBeamerOpen);
  const isSubmissionOpen = useDocumentStore((s) => s.isSubmissionOpen);
  const setSubmissionOpen = useDocumentStore((s) => s.setSubmissionOpen);
  const setChunkStudioOpen = useDocumentStore((s) => s.setChunkStudioOpen);
  const setWorkflowOpen = useDocumentStore((s) => s.setWorkflowOpen);
  const setLeanOpen = useDocumentStore((s) => s.setLeanOpen);
  const setTutorialOpen = useDocumentStore((s) => s.setTutorialOpen);
  const leanLakeEnabled = useDevFeatureFlag("leanLake");
  const isLeanInfoviewOpen = useDocumentStore((s) => s.isLeanInfoviewOpen);
  const setLeanInfoviewOpen = useDocumentStore((s) => s.setLeanInfoviewOpen);
  const isLatexKeyboardOpen = useDocumentStore((s) => s.isLatexKeyboardOpen);
  const setLatexKeyboardOpen = useDocumentStore((s) => s.setLatexKeyboardOpen);
  const setInspectorOpen = useDocumentStore((s) => s.setInspectorOpen);
  const setInspectorTab = useDocumentStore((s) => s.setInspectorTab);
  const setThreadOpen = useDocumentStore((s) => s.setThreadOpen);

  const errorCount = useDocumentStore(
    (s) =>
      s.compileDiagnostics.filter(
        (diagnostic) => diagnostic.severity === "error",
      ).length,
  );
  const warningCount = useDocumentStore(
    (s) =>
      s.compileDiagnostics.filter(
        (diagnostic) => diagnostic.severity === "warning",
      ).length,
  );

  const syncEnabled = useSyncStore((s) => s.enabled);
  const syncStatus = useSyncStore((s) => s.status);
  const peers = useSyncStore((s) => s.peers);

  const { theme, setTheme } = useTheme();
  const terminalThemeId = useEditorPreferencesStore((s) => s.terminalThemeId);
  const isZenMode = useEditorPreferencesStore((s) => s.isZenMode);
  const toggleZenMode = useEditorPreferencesStore((s) => s.toggleZenMode);
  const [mounted, setMounted] = useState(false);
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [docSummary, setDocSummary] =
    useState<TopBarDocSummary>(readTopBarDocSummary);

  useEffect(() => {
    setMounted(true);

    let timer: number | null = null;
    const commitSummary = () => {
      const next = readTopBarDocSummary();
      setDocSummary((prev) =>
        prev.isBeamer === next.isBeamer &&
        prev.frameCount === next.frameCount &&
        prev.publisher?.id === next.publisher?.id
          ? prev
          : next,
      );
    };
    commitSummary();

    const unsubscribe = useDocumentStore.subscribe((state, prevState) => {
      if (
        state.files === prevState.files &&
        state.mainFileId === prevState.mainFileId &&
        state.activeFileId === prevState.activeFileId
      ) {
        return;
      }

      const structuralChange =
        state.mainFileId !== prevState.mainFileId ||
        state.activeFileId !== prevState.activeFileId ||
        state.files.length !== prevState.files.length;

      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }

      if (structuralChange) {
        commitSummary();
      } else {
        timer = window.setTimeout(() => {
          timer = null;
          commitSummary();
        }, 350);
      }
    });

    return () => {
      if (timer !== null) window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const visibleErrorCount = isLatexActive ? errorCount : 0;
  const visibleWarningCount = isLatexActive ? warningCount : 0;
  const {
    isBeamer,
    frameCount: beamerFrameCount,
    publisher: detectedPublisher,
  } = docSummary;

  const syncLabel =
    syncStatus === "connected"
      ? peers.length > 1
        ? `${peers.length} live`
        : "Live"
      : syncEnabled
        ? "Connecting"
        : "Share";

  const openInspector = (tab: InspectorTab) => {
    setInspectorTab(tab);
    setInspectorOpen(true);
  };

  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center justify-between gap-3 border-hairline border-b bg-background/95 px-3 backdrop-blur-sm transition-opacity duration-200",
        isZenMode && "opacity-75 hover:opacity-100",
      )}
    >
      {isAgentOpen && (
        <AgentPanel open={isAgentOpen} onClose={() => setIsAgentOpen(false)} />
      )}

      {/* Left Zone: Quiet Kanso Identity */}
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-[13px] text-muted-foreground hover:text-foreground"
          asChild
          title="All projects"
        >
          <Link href="/">
            <ChevronLeftIcon className="size-4" />
            <span className="hidden sm:inline">Projects</span>
          </Link>
        </Button>

        <span className="hidden h-4 w-px bg-border/80 sm:block" />

        <div className="flex min-w-0 items-center gap-2">
          <ArcanaMark className="size-5 shrink-0" />
          <h1 className="max-w-[150px] truncate font-medium text-[13px] text-foreground tracking-tight sm:max-w-[260px]">
            {projectName}
          </h1>
          {detectedPublisher && !isZenMode && (
            <button
              type="button"
              onClick={() => setJournalOpen(true)}
              title={`Active format: ${detectedPublisher.name}`}
              className="hidden rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground xl:inline-flex"
            >
              {detectedPublisher.shortName}
            </button>
          )}
        </div>
      </div>

      {/* Right Zone: Seiton Studio Menu + Ma Focus + Assistant + Primary Submit + Quiet Appearance */}
      <div className="flex shrink-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-[13px] text-foreground/85 hover:bg-accent hover:text-foreground"
              aria-label="Workspace studio tools"
            >
              <span className="relative flex items-center">
                <LayersIcon className="size-4 text-primary" />
                {visibleErrorCount > 0 ? (
                  <span
                    className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive"
                    aria-hidden="true"
                  />
                ) : visibleWarningCount > 0 ? (
                  <span
                    className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500"
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              <span className="hidden sm:inline">Studio</span>
              <ChevronDownIcon className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-[0.625rem] text-muted-foreground uppercase tracking-[0.08em]">
              Figures &amp; Code
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setFigureStudioOpen(true)}>
              <WandSparklesIcon className="size-3.5 text-primary" />
              Scientific Figure Studio
              <DropdownMenuShortcut>Py / R</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTikzOpen(true)}>
              <ShapesIcon className="size-3.5 text-muted-foreground" />
              TikZ Vector Studio
            </DropdownMenuItem>
            {isBeamer && (
              <DropdownMenuItem onSelect={() => setBeamerOpen(true)}>
                <PresentationIcon className="size-3.5 text-muted-foreground" />
                Beamer Deck
                <DropdownMenuShortcut>{beamerFrameCount}</DropdownMenuShortcut>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => setLatexKeyboardOpen(!isLatexKeyboardOpen)}
              disabled={!isLatexActive}
            >
              <KeyboardIcon className="size-3.5 text-muted-foreground" />
              LaTeX Keyboard
              <DropdownMenuShortcut>⌘⇧K</DropdownMenuShortcut>
            </DropdownMenuItem>
            {isLeanActive && (
              <DropdownMenuItem
                onSelect={() => setLeanInfoviewOpen(!isLeanInfoviewOpen)}
              >
                <CrosshairIcon className="size-3.5 text-muted-foreground" />
                {isLeanInfoviewOpen
                  ? "Hide Lean Infoview"
                  : "Show Lean Infoview"}
              </DropdownMenuItem>
            )}
            {leanLakeEnabled && (
              <DropdownMenuItem onSelect={() => setLeanOpen(true)}>
                <CrosshairIcon className="size-3.5 text-muted-foreground" />
                Lean Lake Project…
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[0.625rem] text-muted-foreground uppercase tracking-[0.08em]">
              Research &amp; Quality
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => setWorkflowOpen(true)}>
              <ListChecksIcon className="size-3.5 text-primary" />
              Research Pipeline (preprint → journal)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setJournalOpen(true)}>
              <BookMarkedIcon className="size-3.5 text-muted-foreground" />
              Journal &amp; Publisher Formats
              {detectedPublisher && (
                <DropdownMenuShortcut>
                  {detectedPublisher.shortName}
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLiteratureOpen(true)}>
              <BookOpenIcon className="size-3.5 text-muted-foreground" />
              Literature Search
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setChunkStudioOpen(true)}>
              <FileCodeIcon className="size-3.5 text-muted-foreground" />
              Long-Paper Chunk Studio
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTextRestorerOpen(true)}>
              <ScanTextIcon className="size-3.5 text-primary" />
              Text Restorer (ML)
              <DropdownMenuShortcut>ML</DropdownMenuShortcut>
            </DropdownMenuItem>
            {process.env.NEXT_PUBLIC_AGENT_BACKEND === "1" && (
              <DropdownMenuItem onSelect={() => setIsAgentOpen(true)}>
                <SparklesIcon className="size-3.5 text-muted-foreground" />
                Local Agent
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[0.625rem] text-muted-foreground uppercase tracking-[0.08em]">
              Project &amp; History
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => openInspector("project")}>
              Project Info &amp; Diagnostics
              <DropdownMenuShortcut>⌘I</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openInspector("versions")}>
              Version History &amp; Diffs
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setCommentsOpen(true)}>
              Comments
              {openCommentCount > 0 && (
                <DropdownMenuShortcut>{openCommentCount}</DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openInspector("logs")}>
              Compile Log
              {visibleErrorCount > 0 && (
                <DropdownMenuShortcut className="text-destructive">
                  {visibleErrorCount} error{visibleErrorCount === 1 ? "" : "s"}
                </DropdownMenuShortcut>
              )}
              {visibleErrorCount === 0 && visibleWarningCount > 0 && (
                <DropdownMenuShortcut>
                  {visibleWarningCount} warn
                  {visibleWarningCount === 1 ? "" : "s"}
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSyncOpen(true)}>
              <UsersIcon className="size-3.5 text-muted-foreground" />
              Live Share &amp; Sync
              <DropdownMenuShortcut>{syncLabel}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setTutorialOpen(true)}>
              <CompassIcon className="size-3.5 text-primary" />
              Quick Tutorial
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <BarButton
          onClick={toggleZenMode}
          active={isZenMode}
          title={isZenMode ? "Exit Ma Focus Mode (⌘⇧Z)" : "Ma Focus Mode (⌘⇧Z)"}
          className="hidden md:flex"
        >
          {isZenMode ? (
            <Minimize2Icon className="size-4 text-primary" />
          ) : (
            <Maximize2Icon className="size-4 text-muted-foreground" />
          )}
          <span className="hidden xl:inline">
            {isZenMode ? "Focused" : "Focus"}
          </span>
        </BarButton>

        <BarButton onClick={() => setThreadOpen(true)} title="Open assistant">
          <SparklesIcon className="size-4 text-primary" />
          <span className="hidden sm:inline">Assistant</span>
        </BarButton>

        <button
          type="button"
          onClick={() => setSubmissionOpen(true)}
          title="Preprint & journal submission readiness"
          aria-label="Submit"
          className={cn(
            "ml-1 flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 font-medium text-[13px] transition-colors sm:px-3",
            isSubmissionOpen
              ? "bg-primary/85 text-primary-foreground"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <FileCheck2Icon className="size-4" />
          <span className="hidden sm:inline">Submit</span>
        </button>

        <span className="mx-0.5 hidden h-4 w-px bg-border sm:block" />

        <AppearanceButton iconOnly />

        <DevPanelButton />

        {terminalThemeId === "arcana" && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => {
              if (theme === "system") setTheme("light");
              else if (theme === "light") setTheme("dark");
              else setTheme("system");
            }}
            title={
              !mounted
                ? "Theme"
                : theme === "system"
                  ? "System theme"
                  : theme === "light"
                    ? "Light mode"
                    : "Dark mode"
            }
          >
            {!mounted ? (
              <MonitorIcon className="size-4" />
            ) : theme === "system" ? (
              <MonitorIcon className="size-4" />
            ) : theme === "light" ? (
              <SunIcon className="size-4" />
            ) : (
              <MoonIcon className="size-4" />
            )}
          </Button>
        )}
      </div>
    </header>
  );
}
