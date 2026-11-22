"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import {
  BookMarkedIcon,
  BookOpenIcon,
  CodeXmlIcon,
  EyeIcon,
  FolderIcon,
  Minimize2Icon,
} from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Sidebar } from "./sidebar";
import { LatexEditor } from "./editor/latex-editor";
import { LatexTools } from "./editor/latex-tools";
import { BibTools } from "./editor/bib-tools";
import { ResearchTools } from "./editor/research-tools";
import { CodeTools } from "./editor/code-tools";
import { ProofTools } from "./editor/proof-tools";
import { PdfPreview } from "./preview/pdf-preview";
import { WorkspaceTopBar } from "./workspace-top-bar";
import { useAutoCompile } from "@/hooks/use-auto-compile";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProjectInit } from "@/hooks/use-project-init";
import { useProjectSync } from "@/hooks/use-project-sync";
import { startCompileScheduler } from "@/lib/compile-project";
import { useDocumentStore } from "@/stores/document-store";
import { isLeanFile } from "@/lib/lean";
import { useDevFeatureFlag } from "@/stores/dev-panel-store";
import { useEditorPreferencesStore } from "@/stores/editor-preferences-store";
import { usePatchStore } from "@/stores/patch-store";
import { cn } from "@/lib/utils";

const BeamerPanel = dynamic(
  () => import("./beamer-panel").then((m) => m.BeamerPanel),
  { ssr: false },
);
const LeanInfoview = dynamic(
  () => import("./lean-infoview").then((m) => m.LeanInfoview),
  { ssr: false },
);
const LeanPanel = dynamic(
  () => import("./lean-panel").then((m) => m.LeanPanel),
  { ssr: false },
);
const CommentsPanel = dynamic(
  () => import("./comments-panel").then((m) => m.CommentsPanel),
  { ssr: false },
);
const FigureStudioPanel = dynamic(
  () => import("./figure-studio-panel").then((m) => m.FigureStudioPanel),
  { ssr: false },
);
const JournalPanel = dynamic(
  () => import("./journal-panel").then((m) => m.JournalPanel),
  { ssr: false },
);
const LiteraturePanel = dynamic(
  () => import("./literature-panel").then((m) => m.LiteraturePanel),
  { ssr: false },
);
const ProjectInspector = dynamic(
  () => import("./project-inspector").then((m) => m.ProjectInspector),
  { ssr: false },
);
const ChunkStudioPanel = dynamic(
  () => import("./chunk-studio-panel").then((m) => m.ChunkStudioPanel),
  { ssr: false },
);
const ResearchWorkflowPanel = dynamic(
  () =>
    import("./research-workflow-panel").then((m) => m.ResearchWorkflowPanel),
  { ssr: false },
);
const SubmissionPanel = dynamic(
  () => import("./submission-panel").then((m) => m.SubmissionPanel),
  { ssr: false },
);
const SyncDialog = dynamic(
  () => import("./sync-dialog").then((m) => m.SyncDialog),
  { ssr: false },
);
const TextRestorerPanel = dynamic(
  () => import("./text-restorer-panel").then((m) => m.TextRestorerPanel),
  { ssr: false },
);
const TikzStudio = dynamic(
  () => import("./tikz-studio").then((m) => m.TikzStudio),
  { ssr: false },
);
const PatchPreviewDialog = dynamic(
  () => import("./patch-preview-dialog").then((m) => m.PatchPreviewDialog),
  { ssr: false },
);
const FirstRunTutorial = dynamic(
  () => import("./first-run-tutorial").then((m) => m.FirstRunTutorial),
  { ssr: false },
);

export function WorkspaceLayout() {
  useProjectInit();
  useAutoCompile();

  useEffect(() => startCompileScheduler(), []);

  const leanLakeEnabled = useDevFeatureFlag("leanLake");
  const isMobile = useIsMobile();
  const projectId = useDocumentStore((s) => s.projectId);
  const fileCount = useDocumentStore((s) => s.files.length);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const isLeanActive = useDocumentStore((s) => {
    const file = s.files.find((item) => item.id === s.activeFileId);
    return file ? isLeanFile(file) : false;
  });
  const isLeanInfoviewOpen = useDocumentStore((s) => s.isLeanInfoviewOpen);
  const leanInfoviewDock = useDocumentStore((s) => s.leanInfoviewDock);
  const setLeanInfoviewOpen = useDocumentStore((s) => s.setLeanInfoviewOpen);
  const isSyncOpen = useDocumentStore((s) => s.isSyncOpen);
  const setSyncOpen = useDocumentStore((s) => s.setSyncOpen);
  const mobilePane = useDocumentStore((s) => s.mobilePane);
  const setMobilePane = useDocumentStore((s) => s.setMobilePane);
  const isJournalOpen = useDocumentStore((s) => s.isJournalOpen);
  const isLiteratureOpen = useDocumentStore((s) => s.isLiteratureOpen);
  const isBeamerOpen = useDocumentStore((s) => s.isBeamerOpen);
  const isLeanOpen = useDocumentStore((s) => s.isLeanOpen);
  const isCommentsOpen = useDocumentStore((s) => s.isCommentsOpen);
  const isInspectorOpen = useDocumentStore((s) => s.isInspectorOpen);
  const isSubmissionOpen = useDocumentStore((s) => s.isSubmissionOpen);
  const isTikzOpen = useDocumentStore((s) => s.isTikzOpen);
  const setJournalOpen = useDocumentStore((s) => s.setJournalOpen);
  const setLiteratureOpen = useDocumentStore((s) => s.setLiteratureOpen);
  const isChunkStudioOpen = useDocumentStore((s) => s.isChunkStudioOpen);
  const setChunkStudioOpen = useDocumentStore((s) => s.setChunkStudioOpen);
  const isWorkflowOpen = useDocumentStore((s) => s.isWorkflowOpen);
  const setWorkflowOpen = useDocumentStore((s) => s.setWorkflowOpen);
  const isFigureStudioOpen = useDocumentStore((s) => s.isFigureStudioOpen);
  const setFigureStudioOpen = useDocumentStore((s) => s.setFigureStudioOpen);
  const isTextRestorerOpen = useDocumentStore((s) => s.isTextRestorerOpen);
  const setTextRestorerOpen = useDocumentStore((s) => s.setTextRestorerOpen);
  const isTutorialOpen = useDocumentStore((s) => s.isTutorialOpen);
  const setTutorialOpen = useDocumentStore((s) => s.setTutorialOpen);
  const isPatchOpen = usePatchStore((s) => s.patch !== null);
  const compilePhase = useDocumentStore((s) => s.compile.phase);
  const errorCount = useDocumentStore(
    (s) => s.compileDiagnostics.filter((d) => d.severity === "error").length,
  );
  const monoFontId = useEditorPreferencesStore((s) => s.monoFontId);
  const isZenMode = useEditorPreferencesStore((s) => s.isZenMode);
  const setZenMode = useEditorPreferencesStore((s) => s.setZenMode);
  const toggleZenMode = useEditorPreferencesStore((s) => s.toggleZenMode);

  useProjectSync(projectId ?? "");

  const showLeanInfoview = isLeanActive && isLeanInfoviewOpen;

  useEffect(() => {
    if (isLeanActive) setLeanInfoviewOpen(true);
  }, [activeFileId, isLeanActive, setLeanInfoviewOpen]);

  useEffect(() => {
    try {
      if (
        window.localStorage.getItem("arcanatex.tutorial.completed.v1") !== "1"
      ) {
        setTutorialOpen(true);
      }
    } catch {
      // Ignore storage access failures.
    }
  }, [setTutorialOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        toggleZenMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleZenMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.workspace = "true";
    root.dataset.workspaceMono = monoFontId;
    return () => {
      delete root.dataset.workspace;
      delete root.dataset.workspaceMono;
    };
  }, [monoFontId]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <WorkspaceTopBar />
      <LatexTools />
      <BibTools />
      <ResearchTools />
      <CodeTools />
      <ProofTools />
      {isPatchOpen && <PatchPreviewDialog />}
      {isBeamerOpen && <BeamerPanel />}
      {leanLakeEnabled && isLeanOpen && <LeanPanel />}
      {isCommentsOpen && <CommentsPanel />}
      {isJournalOpen && <JournalPanel />}
      {isLiteratureOpen && <LiteraturePanel />}
      {isInspectorOpen && <ProjectInspector />}
      {isSubmissionOpen && <SubmissionPanel />}
      {isChunkStudioOpen && (
        <ChunkStudioPanel
          open={isChunkStudioOpen}
          onOpenChange={setChunkStudioOpen}
        />
      )}
      {isWorkflowOpen && (
        <ResearchWorkflowPanel
          open={isWorkflowOpen}
          onOpenChange={setWorkflowOpen}
        />
      )}
      {isFigureStudioOpen && (
        <FigureStudioPanel
          open={isFigureStudioOpen}
          onOpenChange={setFigureStudioOpen}
        />
      )}
      {isTextRestorerOpen && (
        <TextRestorerPanel
          open={isTextRestorerOpen}
          onOpenChange={setTextRestorerOpen}
        />
      )}
      {isSyncOpen && (
        <SyncDialog open={isSyncOpen} onOpenChange={setSyncOpen} />
      )}
      {isTikzOpen && <TikzStudio />}
      {isTutorialOpen && (
        <FirstRunTutorial
          open={isTutorialOpen}
          onOpenChange={setTutorialOpen}
        />
      )}

      {isMobile ? (
        <>
          <div className="min-h-0 flex-1 overflow-hidden">
            {mobilePane === "files" ? (
              <Sidebar />
            ) : mobilePane === "preview" ? (
              <PdfPreview />
            ) : showLeanInfoview ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="min-h-0 flex-1">
                  <LatexEditor />
                </div>
                <div className="h-[38%] shrink-0 border-hairline border-t">
                  <LeanInfoview />
                </div>
              </div>
            ) : (
              <LatexEditor />
            )}
          </div>

          <nav
            aria-label="Workspace navigation"
            className="flex h-14 shrink-0 items-center justify-around border-hairline border-t bg-background px-1"
          >
            <button
              type="button"
              onClick={() => setMobilePane("files")}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1 text-[0.7rem] transition-colors",
                mobilePane === "files"
                  ? "font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="relative">
                <FolderIcon className="size-4" />
                <span className="absolute -top-1.5 -right-2.5 rounded-full bg-muted px-1 font-mono text-[0.58rem] text-foreground leading-3.5">
                  {fileCount}
                </span>
              </span>
              <span>Files</span>
            </button>

            <button
              type="button"
              onClick={() => setMobilePane("editor")}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1 text-[0.7rem] transition-colors",
                mobilePane === "editor"
                  ? "font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CodeXmlIcon className="size-4" />
              <span>Write</span>
            </button>

            <button
              type="button"
              onClick={() => setMobilePane("preview")}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1 text-[0.7rem] transition-colors",
                mobilePane === "preview"
                  ? "font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="relative">
                <EyeIcon className="size-4" />
                {errorCount > 0 ? (
                  <span className="absolute -top-1.5 -right-2 flex min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[0.58rem] text-white leading-3.5">
                    {errorCount > 9 ? "9+" : errorCount}
                  </span>
                ) : compilePhase === "compiling" ? (
                  <span className="absolute -top-0.5 -right-1.5 size-2 animate-pulse rounded-full bg-primary" />
                ) : null}
              </span>
              <span>PDF</span>
            </button>

            <button
              type="button"
              onClick={() => setJournalOpen(true)}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1 text-[0.7rem] transition-colors",
                isJournalOpen
                  ? "font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <BookMarkedIcon className="size-4" />
              <span>Journals</span>
            </button>

            <button
              type="button"
              onClick={() => setLiteratureOpen(true)}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1 text-[0.7rem] transition-colors",
                isLiteratureOpen
                  ? "font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <BookOpenIcon className="size-4" />
              <span>Research</span>
            </button>
          </nav>
        </>
      ) : (
        <div className="zen-editor-surface relative flex min-h-0 flex-1">
          {isZenMode && (
            <button
              type="button"
              onClick={() => setZenMode(false)}
              title="Exit Ma Focus Mode (⌘⇧Z)"
              className="fixed right-4 bottom-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/90 px-3 py-1.5 text-[12px] text-foreground/85 shadow-sm backdrop-blur-md transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Minimize2Icon className="size-3.5 text-primary" />
              <span>Ma Focus · Exit (⌘⇧Z)</span>
            </button>
          )}
          <PanelGroup
            key={`${showLeanInfoview ? `lean-${leanInfoviewDock}` : "standard"}-${isZenMode ? "zen" : "full"}`}
            direction="horizontal"
            className="min-h-0 flex-1"
          >
            {!isZenMode && (
              <>
                <Panel defaultSize={16} minSize={11} maxSize={26}>
                  <Sidebar />
                </Panel>

                <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-primary/50" />
              </>
            )}

            <Panel
              defaultSize={
                showLeanInfoview ? (isZenMode ? 100 : 84) : isZenMode ? 52 : 42
              }
              minSize={25}
            >
              {showLeanInfoview ? (
                <div className="flex h-full min-h-0 min-w-0">
                  {leanInfoviewDock === "left" && (
                    <div className="w-[clamp(260px,30vw,360px)] shrink-0 border-hairline border-r">
                      <LeanInfoview />
                    </div>
                  )}
                  <div className="min-h-0 min-w-0 flex-1">
                    <LatexEditor />
                  </div>
                  {leanInfoviewDock === "right" && (
                    <div className="w-[clamp(260px,30vw,360px)] shrink-0 border-hairline border-l">
                      <LeanInfoview />
                    </div>
                  )}
                </div>
              ) : (
                <LatexEditor />
              )}
            </Panel>

            {!showLeanInfoview && (
              <>
                <PanelResizeHandle className="w-px bg-border transition-colors hover:bg-primary/50" />

                <Panel defaultSize={isZenMode ? 48 : 42} minSize={25}>
                  <PdfPreview />
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>
      )}
    </div>
  );
}
