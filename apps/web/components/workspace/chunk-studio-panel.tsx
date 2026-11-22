"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CopyIcon,
  FileCode2Icon,
  LayersIcon,
  LocateFixedIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { applyAgentEdit } from "@/lib/ai/agent-edits";
import { type AppliedEdit, applyEdits } from "@/lib/ai/file-edits";
import {
  assembleWholeRevision,
  buildChunkContextEnvelope,
  type ChunkRevisionSession,
  createChunkSession,
  discardAllStagedRevisions,
  hashText,
  loadChunkSession,
  saveChunkSession,
  stageChunkRevision,
  unstageChunkRevision,
} from "@/lib/document-chunks";
import { applyAllSafeLintFixes, lintLatexFile } from "@/lib/latex-linter";
import { detectMainFile, isLatexDocumentFile } from "@/lib/project-files";
import { createProjectVersion } from "@/lib/projects/repository";
import { cn } from "@/lib/utils";
import { useAgentChangesStore } from "@/stores/agent-changes-store";
import { useDocumentStore } from "@/stores/document-store";

type ChunkViewMode = "digest" | "edit";

export interface ChunkStudioPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChunkStudioPanel({
  open,
  onOpenChange,
}: ChunkStudioPanelProps) {
  const projectId = useDocumentStore((s) => s.projectId);
  const projectName = useDocumentStore((s) => s.projectName);
  const createdAt = useDocumentStore((s) => s.createdAt);
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const mainFileId = useDocumentStore((s) => s.mainFileId);
  const compiler = useDocumentStore((s) => s.compiler);
  const comments = useDocumentStore((s) => s.comments);

  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const requestJump = useDocumentStore((s) => s.requestJumpToPosition);
  const requestCompile = useDocumentStore((s) => s.requestCompile);

  const activeFile = files.find((f) => f.id === activeFileId);
  const targetTexFile = useMemo(() => {
    if (activeFile && isLatexDocumentFile(activeFile)) return activeFile;
    const main =
      files.find((f) => f.id === mainFileId) ?? detectMainFile(files) ?? null;
    return main && isLatexDocumentFile(main) ? main : null;
  }, [activeFile, files, mainFileId]);

  const currentContent = targetTexFile?.content ?? "";
  const sessionProjectKey = projectId ?? "local-workspace";

  const [session, setSession] = useState<ChunkRevisionSession | null>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ChunkViewMode>("digest");
  const [draftText, setDraftText] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [isPasting, setIsPasting] = useState(false);

  // Hydrate or initialize chunk session whenever the panel opens or target file changes.
  useEffect(() => {
    if (!open || !targetTexFile) {
      if (!targetTexFile) setSession(null);
      return;
    }

    const existing = loadChunkSession(sessionProjectKey, targetTexFile.id);
    const liveHash = hashText(currentContent);

    if (existing) {
      const stagedCount = Object.keys(existing.stagedRevisions).length;
      if (existing.sourceHash === liveHash || stagedCount > 0) {
        setSession(existing);
        setSelectedChunkId((prev) =>
          prev && existing.chunks.some((c) => c.id === prev)
            ? prev
            : (existing.chunks[0]?.id ?? null),
        );
        return;
      }
    }

    const fresh = createChunkSession({
      projectId: sessionProjectKey,
      fileId: targetTexFile.id,
      filePath: targetTexFile.path,
      content: currentContent,
    });
    saveChunkSession(fresh);
    setSession(fresh);
    setSelectedChunkId(fresh.chunks[0]?.id ?? null);
  }, [open, sessionProjectKey, targetTexFile?.id]);

  const activeChunk = useMemo(() => {
    if (!session || session.chunks.length === 0) return null;
    return (
      session.chunks.find((c) => c.id === selectedChunkId) ?? session.chunks[0]
    );
  }, [session, selectedChunkId]);

  const activeDigest = useMemo(() => {
    if (!session || !activeChunk) return null;
    return (
      session.compressed.chunkDigests.find(
        (d) => d.chunkId === activeChunk.id,
      ) ?? null
    );
  }, [session, activeChunk]);

  const contextEnvelope = useMemo(() => {
    if (!session || !activeChunk) return null;
    return buildChunkContextEnvelope(session, activeChunk.id);
  }, [session, activeChunk]);

  // Sync draft editor when switching selected chunk or staging/unstaging.
  useEffect(() => {
    if (!session || !activeChunk) {
      setDraftText("");
      setDraftNote("");
      return;
    }
    const staged = session.stagedRevisions[activeChunk.id];
    setDraftText(staged ? staged.revisedContent : activeChunk.content);
    setDraftNote(staged?.note ?? "");
  }, [
    session?.updatedAt,
    activeChunk?.id,
    activeChunk?.content,
    session?.stagedRevisions,
  ]);

  const activeDraftLint = useMemo(() => {
    if (!targetTexFile || !activeChunk) return [];
    return lintLatexFile(draftText, targetTexFile.path);
  }, [activeChunk, draftText, targetTexFile]);
  const fixableDraftLintCount = useMemo(
    () => activeDraftLint.filter((issue) => Boolean(issue.fix)).length,
    [activeDraftLint],
  );
  const chunkLintCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!session || !targetTexFile) return counts;
    for (const chunk of session.chunks) {
      const text =
        session.stagedRevisions[chunk.id]?.revisedContent ?? chunk.content;
      const issues = lintLatexFile(text, targetTexFile.path);
      if (issues.length > 0) counts.set(chunk.id, issues.length);
    }
    return counts;
  }, [session, targetTexFile]);

  const stagedChunkIds = useMemo(() => {
    if (!session) return [];
    return session.chunks
      .filter((chunk) => {
        const staged = session.stagedRevisions[chunk.id];
        return staged && staged.revisedContent !== chunk.content;
      })
      .map((c) => c.id);
  }, [session]);

  const assembly = useMemo(() => {
    if (!session || !targetTexFile) return null;
    return assembleWholeRevision(currentContent, session);
  }, [currentContent, session, targetTexFile]);

  const hasSourceDriftSinceIndex = Boolean(
    session && hashText(currentContent) !== session.sourceHash,
  );

  const handleCompressAndIndex = () => {
    if (!targetTexFile) return;
    const next = createChunkSession({
      projectId: sessionProjectKey,
      fileId: targetTexFile.id,
      filePath: targetTexFile.path,
      content: currentContent,
    });
    saveChunkSession(next);
    setSession(next);
    setSelectedChunkId(next.chunks[0]?.id ?? null);
    toast.success(`Indexed ${next.chunks.length} chunks`, {
      description: `Compressed ${next.compressed.originalChars.toLocaleString()} → ${next.compressed.compressedChars.toLocaleString()} chars (${Math.round(next.compressed.compressionRatio * 100)}% saved).`,
    });
  };

  const handleCopyCompressedMap = async () => {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.compressed.digestMarkdown);
      toast.success("Copied compressed paper map", {
        description: `${session.compressed.compressedChars.toLocaleString()} chars (~${session.compressed.estimatedTokensSaved.toLocaleString()} tokens saved).`,
      });
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleDiscardAllStaged = () => {
    if (!session) return;
    const next = discardAllStagedRevisions(session);
    saveChunkSession(next);
    setSession(next);
    if (activeChunk) {
      setDraftText(activeChunk.content);
      setDraftNote("");
    }
    toast.success("Discarded all staged chunk revisions");
  };

  const handleStageChunk = () => {
    if (!session || !activeChunk) return;
    const next = stageChunkRevision(
      session,
      activeChunk.id,
      draftText,
      draftNote.trim() || undefined,
    );
    saveChunkSession(next);
    setSession(next);
    toast.success(`Staged revision for ${activeChunk.id}`, {
      description: activeChunk.heading,
    });
  };

  const handleUnstageChunk = () => {
    if (!session || !activeChunk) return;
    const next = unstageChunkRevision(session, activeChunk.id);
    saveChunkSession(next);
    setSession(next);
    setDraftText(activeChunk.content);
    setDraftNote("");
    toast.info(`Unstaged ${activeChunk.id}`);
  };

  const handleJumpToChunk = (offset: number) => {
    if (!targetTexFile) return;
    setActiveFile(targetTexFile.id);
    requestJump(offset);
  };

  const handlePasteWholeRevision = async () => {
    if (!session || !targetTexFile || isPasting) return;
    setIsPasting(true);

    try {
      const state = useDocumentStore.getState();
      const liveFile = state.files.find((f) => f.id === targetTexFile.id);
      if (!liveFile) {
        toast.error("The target LaTeX file no longer exists.");
        return;
      }

      const liveContent = liveFile.content ?? "";
      const reassembled = assembleWholeRevision(liveContent, session);
      if (!reassembled.ok) {
        toast.error("Source drift prevents safe reassembly", {
          description: `Edited chunks changed externally: ${reassembled.driftedChunkIds.join(", ")}. Re-index or copy edits manually.`,
        });
        return;
      }

      if (reassembled.changedChunkIds.length === 0) {
        toast.info("No chunk changes to paste");
        return;
      }

      if (state.projectId) {
        try {
          await createProjectVersion({
            projectId: state.projectId,
            label: `Before pasting ${reassembled.changedChunkIds.length} chunk revision(s)`,
            name: state.projectName || projectName,
            projectCreatedAt: state.createdAt ?? createdAt ?? Date.now(),
            files: state.files,
            activeFileId: state.activeFileId || liveFile.id,
            mainFileId: state.mainFileId,
            compiler: state.compiler || compiler,
            comments: state.comments ?? comments,
          });
        } catch (error) {
          console.warn("Could not save pre-paste version snapshot", error);
        }
      }

      let applied: AppliedEdit[] = [];
      if (
        reassembled.patch.kind === "edits" &&
        reassembled.patch.edits.length > 0
      ) {
        const planned = applyEdits(liveContent, reassembled.patch.edits);
        if (planned.ok) {
          applied = planned.applied;
        }
      }

      const turnId = `chunk-studio-${Date.now()}`;
      const editResult = await applyAgentEdit({
        turnId,
        toolCallId: `chunk-paste-${Date.now()}`,
        fileId: liveFile.id,
        before: liveContent,
        after: reassembled.content,
        applied,
      });

      if (!editResult.ok) {
        toast.error(
          editResult.reason === "conflict"
            ? "The document changed while pasting. Try again."
            : "Target file is no longer available.",
        );
        return;
      }

      const nextSession = createChunkSession({
        projectId: sessionProjectKey,
        fileId: liveFile.id,
        filePath: liveFile.path,
        content: reassembled.content,
      });
      saveChunkSession(nextSession);
      setSession(nextSession);
      setSelectedChunkId(nextSession.chunks[0]?.id ?? null);

      state.setActiveFile(liveFile.id);
      useAgentChangesStore.getState().startReview(turnId, liveFile.id);
      const firstChange = editResult.change?.applied[0];
      if (firstChange) {
        state.requestJumpToPosition(firstChange.start);
      }
      requestCompile();

      toast.success("Whole revision pasted", {
        description: `Applied ${reassembled.changedChunkIds.length} chunk(s) (+${reassembled.stats.added} / -${reassembled.stats.removed} lines) with Review diff active.`,
      });
    } finally {
      setIsPasting(false);
    }
  };

  const totalWords = useMemo(
    () => session?.chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0) ?? 0,
    [session],
  );
  const compressionPercent = session
    ? Math.max(0, Math.round(session.compressed.compressionRatio * 100))
    : 0;
  const activeStaged = activeChunk
    ? session?.stagedRevisions[activeChunk.id]
    : undefined;
  const baselineText = activeStaged
    ? activeStaged.revisedContent
    : (activeChunk?.content ?? "");
  const isDraftDirty = Boolean(
    activeChunk &&
      (draftText !== baselineText ||
        draftNote.trim() !== (activeStaged?.note ?? "")),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        overlay={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[680px]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-hairline border-b px-4 py-3 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base">
            <LayersIcon className="size-4 text-primary" />
            Long-Paper Chunk & Compression Studio
          </SheetTitle>
          <SheetDescription className="text-xs">
            {targetTexFile ? (
              <>
                Lossless LaTeX partitioning, scientific compression, and safe
                whole-revision reassembly for{" "}
                <span className="font-mono text-foreground">
                  {targetTexFile.path}
                </span>
                .
              </>
            ) : (
              "Open a .tex document to partition, compress, and stage chunk revisions."
            )}
          </SheetDescription>
        </SheetHeader>

        {!targetTexFile ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground text-sm">
            <FileCode2Icon className="size-8 opacity-40" />
            <p>No active LaTeX (.tex) document found in this project.</p>
          </div>
        ) : (
          <>
            {/* Stats & Top Actions */}
            <div className="flex flex-col gap-2.5 border-hairline border-b bg-muted/20 px-4 py-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <div className="rounded-md border border-hairline bg-background px-2.5 py-1.5">
                  <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                    Original
                  </div>
                  <div className="font-mono font-semibold text-xs">
                    {(
                      session?.compressed.originalChars ?? currentContent.length
                    ).toLocaleString()}{" "}
                    ch
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground">
                    {totalWords.toLocaleString()} words
                  </div>
                </div>
                <div className="rounded-md border border-hairline bg-background px-2.5 py-1.5">
                  <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                    Digest
                  </div>
                  <div className="font-mono font-semibold text-xs">
                    {(
                      session?.compressed.compressedChars ?? 0
                    ).toLocaleString()}{" "}
                    ch
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground">
                    ~
                    {(
                      session?.compressed.estimatedTokensSaved ?? 0
                    ).toLocaleString()}{" "}
                    tok saved
                  </div>
                </div>
                <div className="rounded-md border border-hairline bg-background px-2.5 py-1.5">
                  <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                    Compression
                  </div>
                  <div className="font-mono font-semibold text-emerald-600 text-xs dark:text-emerald-400">
                    {compressionPercent}%
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground">
                    extractive
                  </div>
                </div>
                <div className="rounded-md border border-hairline bg-background px-2.5 py-1.5">
                  <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                    Chunks
                  </div>
                  <div className="font-mono font-semibold text-xs">
                    {session?.chunks.length ?? 0}
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground">
                    lossless
                  </div>
                </div>
                <div
                  className={cn(
                    "rounded-md border px-2.5 py-1.5",
                    stagedChunkIds.length > 0
                      ? "border-primary/40 bg-primary/5"
                      : "border-hairline bg-background",
                  )}
                >
                  <div className="text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                    Staged
                  </div>
                  <div className="font-mono font-semibold text-xs">
                    {stagedChunkIds.length}
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground">
                    pending paste
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="h-7 gap-1.5 text-xs"
                  onClick={handleCompressAndIndex}
                >
                  <RefreshCwIcon className="size-3.5" />
                  Compress & Index Paper
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => void handleCopyCompressedMap()}
                  disabled={!session}
                >
                  <CopyIcon className="size-3.5" />
                  Copy Compressed Map
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 gap-1.5 text-destructive text-xs hover:text-destructive"
                  onClick={handleDiscardAllStaged}
                  disabled={
                    !session ||
                    Object.keys(session.stagedRevisions).length === 0
                  }
                >
                  <Trash2Icon className="size-3.5" />
                  Discard All Staged
                </Button>
              </div>

              {hasSourceDriftSinceIndex && (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-amber-700 text-xs dark:text-amber-300">
                  <AlertTriangleIcon className="size-3.5 shrink-0" />
                  <span>
                    Document changed since indexing. Unedited chunks remain safe
                    via anchored fallback; click{" "}
                    <strong>Compress & Index Paper</strong> to refresh.
                  </span>
                </div>
              )}
            </div>

            {/* Split Outline + Active Chunk View */}
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden sm:grid-cols-[228px_1fr]">
              {/* Outline List */}
              <div className="max-h-48 overflow-y-auto border-hairline border-b bg-muted/10 p-2 sm:max-h-none sm:border-r sm:border-b-0">
                <div className="mb-1.5 px-1.5 font-medium text-[0.68rem] text-muted-foreground uppercase tracking-wider">
                  Manuscript Outline
                </div>
                <div className="flex flex-col gap-1">
                  {session?.chunks.map((chunk) => {
                    const isSelected = chunk.id === activeChunk?.id;
                    const staged = session.stagedRevisions[chunk.id];
                    const hasStagedEdit = Boolean(
                      staged && staged.revisedContent !== chunk.content,
                    );
                    const stmtCount =
                      session.compressed.chunkDigests[chunk.index]?.statements
                        .length ?? 0;

                    return (
                      <button
                        key={chunk.id}
                        type="button"
                        onClick={() => setSelectedChunkId(chunk.id)}
                        className={cn(
                          "flex flex-col gap-1 rounded-md border px-2 py-1.5 text-left transition-colors",
                          isSelected
                            ? "border-primary/50 bg-primary/8"
                            : hasStagedEdit
                              ? "border-amber-500/40 bg-amber-500/5 hover:bg-muted/60"
                              : "border-transparent hover:bg-muted/50",
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono text-[0.65rem] text-muted-foreground">
                            {chunk.id} · L{chunk.startLine}–{chunk.endLine}
                          </span>
                          {hasStagedEdit && (
                            <span className="rounded bg-amber-500/20 px-1 font-medium text-[0.6rem] text-amber-700 dark:text-amber-300">
                              Staged
                            </span>
                          )}
                        </div>
                        <div className="truncate font-medium text-xs">
                          {chunk.heading}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[0.65rem] text-muted-foreground">
                          <span className="rounded bg-muted px-1 py-0.2 font-mono">
                            {chunk.kind}
                          </span>
                          <span>{chunk.wordCount}w</span>
                          {chunk.labels.length > 0 && (
                            <span className="text-sky-600 dark:text-sky-400">
                              {chunk.labels.length} lbl
                            </span>
                          )}
                          {stmtCount > 0 && (
                            <span className="text-violet-600 dark:text-violet-400">
                              {stmtCount} thm
                            </span>
                          )}
                          {chunk.mathBlockCount > 0 && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {chunk.mathBlockCount} eq
                            </span>
                          )}
                          {(chunkLintCounts.get(chunk.id) ?? 0) > 0 && (
                            <span className="text-amber-600 dark:text-amber-400">
                              {chunkLintCounts.get(chunk.id)} lint
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Chunk Detail */}
              {activeChunk && activeDigest && contextEnvelope ? (
                <div className="flex min-h-0 flex-col overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-hairline border-b px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[0.7rem] text-muted-foreground">
                          {activeChunk.id}
                        </span>
                        <span className="truncate font-semibold text-sm">
                          {activeChunk.heading}
                        </span>
                      </div>
                      <div className="text-[0.7rem] text-muted-foreground">
                        Lines {activeChunk.startLine}–{activeChunk.endLine} ·{" "}
                        {activeChunk.charCount.toLocaleString()} chars ·{" "}
                        {activeChunk.wordCount} words
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => handleJumpToChunk(activeChunk.startOffset)}
                    >
                      <LocateFixedIcon className="size-3.5" />
                      Jump
                    </Button>
                  </div>

                  {/* Mode Switch */}
                  <div className="border-hairline border-b px-3.5 py-2">
                    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                      <button
                        type="button"
                        onClick={() => setViewMode("digest")}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-xs transition-colors",
                          viewMode === "digest"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <SparklesIcon className="size-3.5" />
                        Compressed Digest & Context Envelope
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("edit")}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-xs transition-colors",
                          viewMode === "edit"
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <FileCode2Icon className="size-3.5" />
                        Edit Chunk Verbatim
                      </button>
                    </div>
                  </div>

                  {viewMode === "digest" ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5 text-xs">
                      <div className="rounded-md border border-hairline bg-muted/20 p-2.5">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-wider">
                            Extractive Chunk Digest
                          </span>
                          <span className="font-mono text-[0.65rem] text-muted-foreground">
                            {activeDigest.compressedChars} /{" "}
                            {activeDigest.originalChars} chars
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">
                          {activeDigest.summary}
                        </p>
                      </div>

                      {activeDigest.statements.length > 0 && (
                        <div className="rounded-md border border-hairline bg-background p-2.5">
                          <div className="mb-1.5 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-wider">
                            Theorem & Environment Signatures
                          </div>
                          <div className="flex flex-col gap-1.5">
                            {activeDigest.statements.map((stmt, idx) => (
                              <div
                                key={`${stmt.environment}-${stmt.line}-${idx}`}
                                className="rounded border border-hairline/70 bg-muted/15 px-2 py-1.5"
                              >
                                <div className="font-mono text-[0.68rem] text-primary">
                                  L{stmt.line} · {stmt.environment}
                                  {stmt.title ? ` [${stmt.title}]` : ""}
                                  {stmt.label
                                    ? ` · \\label{${stmt.label}}`
                                    : ""}
                                </div>
                                <div className="mt-0.5 text-muted-foreground">
                                  {stmt.statement}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(activeChunk.labels.length > 0 ||
                        activeChunk.refs.length > 0 ||
                        activeChunk.cites.length > 0) && (
                        <div className="rounded-md border border-hairline bg-background p-2.5">
                          <div className="mb-1.5 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-wider">
                            Cross-References & Citations
                          </div>
                          <div className="flex flex-col gap-1 font-mono text-[0.7rem]">
                            {activeChunk.labels.length > 0 && (
                              <div>
                                <span className="text-muted-foreground">
                                  labels:{" "}
                                </span>
                                {activeChunk.labels.join(", ")}
                              </div>
                            )}
                            {activeChunk.refs.length > 0 && (
                              <div>
                                <span className="text-muted-foreground">
                                  refs:{" "}
                                </span>
                                {activeChunk.refs.join(", ")}
                              </div>
                            )}
                            {activeChunk.cites.length > 0 && (
                              <div>
                                <span className="text-muted-foreground">
                                  cites:{" "}
                                </span>
                                {activeChunk.cites.join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="rounded-md border border-hairline bg-background p-2.5">
                        <div className="mb-1.5 font-semibold text-[0.7rem] text-muted-foreground uppercase tracking-wider">
                          Prism Context Envelope
                        </div>
                        <div className="flex flex-col gap-2">
                          <div>
                            <div className="mb-0.5 font-medium text-[0.68rem] text-muted-foreground">
                              Manuscript Thesis & Global Notation
                            </div>
                            <pre className="whitespace-pre-wrap rounded bg-muted/30 p-2 font-mono text-[0.68rem] text-foreground/90">
                              {contextEnvelope.thesis}
                            </pre>
                          </div>
                          {contextEnvelope.previousTail && (
                            <div>
                              <div className="mb-0.5 font-medium text-[0.68rem] text-muted-foreground">
                                Previous Chunk Tail
                              </div>
                              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded bg-muted/30 p-2 font-mono text-[0.68rem] text-muted-foreground">
                                {contextEnvelope.previousTail}
                              </pre>
                            </div>
                          )}
                          {contextEnvelope.nextHead && (
                            <div>
                              <div className="mb-0.5 font-medium text-[0.68rem] text-muted-foreground">
                                Next Chunk Head
                              </div>
                              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap rounded bg-muted/30 p-2 font-mono text-[0.68rem] text-muted-foreground">
                                {contextEnvelope.nextHead}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3.5">
                      <Textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        spellCheck={false}
                        aria-label={`Edit ${activeChunk.id} verbatim`}
                        className="min-h-0 flex-1 resize-none font-mono text-xs leading-relaxed"
                      />
                      <Input
                        value={draftNote}
                        onChange={(e) => setDraftNote(e.target.value)}
                        placeholder="Revision note (optional)"
                        className="h-8 text-xs"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={handleStageChunk}
                          disabled={!isDraftDirty}
                        >
                          <CheckCircle2Icon className="size-3.5" />
                          Stage Chunk Revision
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 text-xs"
                          onClick={handleUnstageChunk}
                          disabled={!activeStaged}
                        >
                          <RotateCcwIcon className="size-3.5" />
                          Unstage
                        </Button>
                        {fixableDraftLintCount > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => {
                              const fixed = applyAllSafeLintFixes(
                                draftText,
                                activeDraftLint,
                              );
                              setDraftText(fixed);
                              toast.success(
                                `Applied ${fixableDraftLintCount} safe lint fix(es) in draft`,
                              );
                            }}
                          >
                            <SparklesIcon className="size-3.5 text-primary" />
                            Fix {fixableDraftLintCount} lint
                          </Button>
                        )}
                        {activeStaged && (
                          <span className="ml-auto text-[0.7rem] text-amber-600 dark:text-amber-400">
                            Staged locally · {draftText.length.toLocaleString()}{" "}
                            chars
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Bottom Whole-Revision Reassembly Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-hairline border-t bg-muted/30 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-0.5 text-xs">
                {assembly?.ok ? (
                  <>
                    <div className="flex items-center gap-2 font-medium">
                      <span>
                        {stagedChunkIds.length} staged chunk
                        {stagedChunkIds.length === 1 ? "" : "s"} · +
                        {assembly.stats.added} / -{assembly.stats.removed} lines
                      </span>
                      {assembly.strategy === "anchored-fallback" &&
                        stagedChunkIds.length > 0 && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[0.65rem] text-amber-700 dark:text-amber-300">
                            anchored fallback
                          </span>
                        )}
                    </div>
                    <span className="text-[0.7rem] text-muted-foreground">
                      Snapshots version history and opens Review diff bar on
                      paste.
                    </span>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-destructive">
                    <AlertTriangleIcon className="size-3.5 shrink-0" />
                    <span>
                      Source drift in:{" "}
                      {assembly?.driftedChunkIds.join(", ") ?? "unknown"}
                    </span>
                  </div>
                )}
              </div>

              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void handlePasteWholeRevision()}
                disabled={
                  isPasting ||
                  stagedChunkIds.length === 0 ||
                  !assembly?.ok ||
                  assembly.changedChunkIds.length === 0
                }
              >
                <LayersIcon className="size-3.5" />
                {isPasting ? "Pasting..." : "Paste Whole Revision"}
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
