"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  BookMarkedIcon,
  CheckCircle2Icon,
  CheckIcon,
  FileCheck2Icon,
  FileTextIcon,
  LayersIcon,
  ListChecksIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  WandSparklesIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  adaptManuscriptToPublisher,
  applyComplianceQuickFix,
  detectPublisherFromContent,
  evaluatePublisherCompliance,
  extractManuscriptParts,
  PUBLISHER_LIST,
  PUBLISHER_TEMPLATES,
  type ComplianceQuickFixId,
  type PublisherId,
  type PublisherSnippet,
} from "@/lib/publishers";
import { detectMainFile, isLatexDocumentFile } from "@/lib/project-files";
import { createProjectVersion } from "@/lib/projects/repository";
import { useDocumentStore } from "@/stores/document-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type JournalTab = "format" | "snippets" | "checklist";

const TABS: {
  id: JournalTab;
  label: string;
  icon: typeof LayersIcon;
}[] = [
  { id: "format", label: "Format & Convert", icon: LayersIcon },
  { id: "snippets", label: "Snippets", icon: SparklesIcon },
  { id: "checklist", label: "Checklist", icon: ListChecksIcon },
];

export function JournalPanel() {
  const open = useDocumentStore((s) => s.isJournalOpen);
  const setOpen = useDocumentStore((s) => s.setJournalOpen);
  const setSubmissionOpen = useDocumentStore((s) => s.setSubmissionOpen);

  const projectId = useDocumentStore((s) => s.projectId);
  const projectName = useDocumentStore((s) => s.projectName);
  const createdAt = useDocumentStore((s) => s.createdAt);
  const files = useDocumentStore((s) => s.files);
  const activeFileId = useDocumentStore((s) => s.activeFileId);
  const mainFileId = useDocumentStore((s) => s.mainFileId);
  const compiler = useDocumentStore((s) => s.compiler);
  const comments = useDocumentStore((s) => s.comments);

  const setActiveFile = useDocumentStore((s) => s.setActiveFile);
  const updateFileContent = useDocumentStore((s) => s.updateFileContent);
  const addFiles = useDocumentStore((s) => s.addFiles);
  const requestCompile = useDocumentStore((s) => s.requestCompile);
  const requestJump = useDocumentStore((s) => s.requestJumpToPosition);

  const activeFile = files.find((f) => f.id === activeFileId);
  const mainFile = useMemo(
    () =>
      files.find((f) => f.id === mainFileId) ??
      detectMainFile(files) ??
      (activeFile && isLatexDocumentFile(activeFile) ? activeFile : null) ??
      null,
    [activeFile, files, mainFileId],
  );
  const targetTexFile =
    (mainFile && isLatexDocumentFile(mainFile) ? mainFile : null) ??
    (activeFile && isLatexDocumentFile(activeFile) ? activeFile : null);
  const mainContent = targetTexFile?.content ?? "";

  const detectedPublisher = useMemo(
    () => detectPublisherFromContent(mainContent),
    [mainContent],
  );

  const [tab, setTab] = useState<JournalTab>("format");
  const [selectedPublisherId, setSelectedPublisherId] = useState<PublisherId>(
    () => detectedPublisher?.id ?? "elsevier",
  );
  const [confirmLoadTemplate, setConfirmLoadTemplate] = useState(false);

  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [email, setEmail] = useState("");
  const [keywords, setKeywords] = useState("");
  const [subjectClass, setSubjectClass] = useState("");

  const syncMetadataFromSource = (source: string) => {
    const parts = extractManuscriptParts(source);
    setTitle(parts.title);
    setAuthors(parts.authors);
    setAffiliation(parts.affiliation);
    setEmail(parts.email);
    setKeywords(parts.keywords);
    setSubjectClass(parts.subjectClass);
  };

  useEffect(() => {
    if (!open) {
      setConfirmLoadTemplate(false);
      return;
    }
    if (detectedPublisher) {
      setSelectedPublisherId(detectedPublisher.id);
    }
    syncMetadataFromSource(mainContent);
  }, [open, targetTexFile?.id, detectedPublisher?.id]);

  const selectedTemplate = PUBLISHER_TEMPLATES[selectedPublisherId];
  const checklistPublisher = detectedPublisher ?? selectedTemplate;

  const complianceItems = useMemo(
    () => evaluatePublisherCompliance(mainContent, files, checklistPublisher),
    [mainContent, files, checklistPublisher],
  );
  const pendingComplianceCount = complianceItems.filter(
    (item) => !item.passed,
  ).length;

  const saveSnapshotQuietly = async (label: string) => {
    if (!projectId || !createdAt) return;
    try {
      await createProjectVersion({
        projectId,
        label,
        name: projectName,
        projectCreatedAt: createdAt,
        files,
        activeFileId,
        mainFileId,
        compiler,
        comments,
      });
    } catch (error) {
      console.warn("Could not save pre-format snapshot", error);
    }
  };

  const addMissingCompanionFiles = (
    incomingFiles: Omit<(typeof files)[number], "id">[],
    preserveFileId: string,
    overwriteStyleFiles = false,
  ) => {
    const existingByPath = new Map(
      useDocumentStore
        .getState()
        .files.map((f) => [f.path.toLowerCase(), f] as const),
    );

    const toAdd: Omit<(typeof files)[number], "id">[] = [];
    for (const file of incomingFiles) {
      const existing = existingByPath.get(file.path.toLowerCase());
      if (!existing) {
        toAdd.push(file);
      } else if (
        overwriteStyleFiles &&
        file.path.toLowerCase().endsWith(".sty") &&
        file.content !== undefined
      ) {
        updateFileContent(existing.id, file.content);
      }
    }

    if (toAdd.length > 0) {
      addFiles(toAdd);
      setActiveFile(preserveFileId);
    }
  };

  const handleAdaptManuscript = async () => {
    if (!targetTexFile || targetTexFile.type !== "tex") {
      toast.error("Open or create a .tex main document first");
      return;
    }

    await saveSnapshotQuietly(
      `Before ${selectedTemplate.shortName} adaptation`,
    );

    const adapted = adaptManuscriptToPublisher(
      mainContent,
      selectedPublisherId,
      {
        title,
        authors,
        affiliation,
        email,
        keywords,
        subjectClass,
      },
    );

    updateFileContent(targetTexFile.id, adapted.texContent);
    addMissingCompanionFiles(adapted.extraFiles, targetTexFile.id, true);
    setActiveFile(targetTexFile.id);
    requestCompile();

    toast.success(`Adapted manuscript to ${selectedTemplate.name}`, {
      description: "Saved a snapshot to version history and triggered compile.",
    });
  };

  const handleLoadCleanTemplate = async () => {
    if (!targetTexFile || targetTexFile.type !== "tex") {
      toast.error("Open or create a .tex main document first");
      return;
    }

    await saveSnapshotQuietly(
      `Before loading ${selectedTemplate.shortName} template`,
    );

    const templateMain = selectedTemplate.files.find(
      (f) => f.path === selectedTemplate.mainFileName,
    );
    const companionFiles = selectedTemplate.files.filter(
      (f) => f.path !== selectedTemplate.mainFileName,
    );

    if (templateMain?.content) {
      updateFileContent(targetTexFile.id, templateMain.content);
      syncMetadataFromSource(templateMain.content);
    }

    // Ensure references.bib also has the template citation keys if a bib file already exists
    const stateFiles = useDocumentStore.getState().files;
    const existingBib = stateFiles.find((f) =>
      f.path.toLowerCase().endsWith(".bib"),
    );
    const templateBib = companionFiles.find((f) =>
      f.path.toLowerCase().endsWith(".bib"),
    );
    if (existingBib && templateBib?.content) {
      const currentBib = existingBib.content ?? "";
      const entries = templateBib.content.split(/\n(?=@)/);
      const missingEntries = entries.filter((entry) => {
        const key = entry.match(/@\w+\s*\{\s*([^,\s]+)\s*,/)?.[1];
        return key ? !currentBib.includes(key) : false;
      });
      if (missingEntries.length > 0) {
        updateFileContent(
          existingBib.id,
          `${currentBib.trimEnd()}\n\n${missingEntries.join("\n").trim()}\n`,
        );
      }
    }

    addMissingCompanionFiles(companionFiles, targetTexFile.id, true);
    setActiveFile(targetTexFile.id);
    setConfirmLoadTemplate(false);
    requestCompile();

    toast.success(`Loaded ${selectedTemplate.name} template`, {
      description: "Saved a snapshot to version history.",
    });
  };

  const insertSnippet = (snippet: PublisherSnippet) => {
    const state = useDocumentStore.getState();
    const currentActive = state.files.find((f) => f.id === state.activeFileId);
    const targetFile =
      (currentActive && isLatexDocumentFile(currentActive)
        ? currentActive
        : null) ?? targetTexFile;

    if (!targetFile) {
      toast.error("Open a .tex file to insert snippets");
      return;
    }

    const switchedFile = targetFile.id !== state.activeFileId;
    if (switchedFile) {
      state.setActiveFile(targetFile.id);
    }

    const content = targetFile.content ?? "";
    const beginDoc = content.indexOf("\\begin{document}");
    const endDoc = content.lastIndexOf("\\end{document}");
    const cursor = switchedFile ? 0 : state.cursorPosition;

    let insertAt = cursor;
    const insideBody =
      cursor > 0 &&
      (beginDoc === -1 || cursor >= beginDoc + "\\begin{document}".length) &&
      (endDoc === -1 || cursor <= endDoc);

    if (snippet.placement === "frontmatter") {
      const endFrontmatter = content.indexOf("\\end{frontmatter}");
      const maketitle = content.indexOf("\\maketitle");
      if (insideBody && endFrontmatter !== -1 && cursor <= endFrontmatter) {
        insertAt = cursor;
      } else if (endFrontmatter !== -1) {
        insertAt = endFrontmatter;
      } else if (maketitle !== -1) {
        insertAt = snippet.id.startsWith("ams-")
          ? maketitle
          : maketitle + "\\maketitle".length;
      } else if (endDoc !== -1) {
        insertAt = endDoc;
      } else {
        insertAt = content.length;
      }
    } else if (snippet.placement === "before-end" && !insideBody) {
      const bibStyleIdx = content.indexOf("\\bibliographystyle");
      const bibIdx = content.indexOf("\\bibliography");
      const anchor =
        bibStyleIdx !== -1 ? bibStyleIdx : bibIdx !== -1 ? bibIdx : endDoc;
      insertAt = anchor !== -1 ? anchor : content.length;
    } else if (!insideBody) {
      const bibStyleIdx = content.indexOf("\\bibliographystyle");
      const anchor =
        bibStyleIdx !== -1
          ? bibStyleIdx
          : endDoc !== -1
            ? endDoc
            : content.length;
      insertAt = anchor;
    }

    const prefix =
      insertAt > 0 && !content.slice(0, insertAt).endsWith("\n") ? "\n" : "";
    const block = `${prefix}${snippet.snippet.endsWith("\n") ? snippet.snippet : `${snippet.snippet}\n`}`;

    state.replaceSelection(insertAt, insertAt, block);
    requestJump(insertAt + prefix.length);
    requestCompile();
    toast.success(`Inserted ${snippet.name}`);
  };

  const handleQuickFix = (quickFixId: ComplianceQuickFixId) => {
    if (!targetTexFile) {
      toast.error("No LaTeX main document found");
      return;
    }

    const next = applyComplianceQuickFix(
      mainContent,
      quickFixId,
      checklistPublisher,
    );
    updateFileContent(targetTexFile.id, next);

    if (quickFixId === "bibstyle") {
      const templateBib = checklistPublisher.files.find((f) =>
        f.path.toLowerCase().endsWith(".bib"),
      );
      if (templateBib) {
        addMissingCompanionFiles([templateBib], targetTexFile.id, false);
      }
    }

    setActiveFile(targetTexFile.id);
    requestCompile();
    toast.success("Applied compliance fix", {
      description: checklistPublisher.shortName,
    });
  };

  const frontmatterSnippets = selectedTemplate.snippets.filter(
    (s) => s.category === "frontmatter",
  );
  const theoremSnippets = selectedTemplate.snippets.filter(
    (s) => s.category === "theorem",
  );
  const tableFigureSnippets = selectedTemplate.snippets.filter(
    (s) => s.category === "table-figure",
  );

  // Also offer key peer-reviewed frontmatter blocks from other publishers for convenience
  const crossPublisherSnippets: PublisherSnippet[] = [
    PUBLISHER_TEMPLATES.elsevier.snippets[0],
    PUBLISHER_TEMPLATES.elsevier.snippets[1],
    PUBLISHER_TEMPLATES["springer-nature"].snippets[0],
    PUBLISHER_TEMPLATES.ieee.snippets[0],
  ].filter(
    (item) =>
      item && !frontmatterSnippets.some((existing) => existing.id === item.id),
  );

  return (
    <Sheet open={open} onOpenChange={setOpen} modal={false}>
      <SheetContent
        overlay={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[540px]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-hairline border-b px-4 py-3 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base">
            <BookMarkedIcon className="size-4 text-primary" />
            Journal & Publisher Studio
          </SheetTitle>
          <SheetDescription className="text-xs">
            Convert manuscripts across 8 peer-reviewed formats, insert journal
            blocks, and verify compliance.
          </SheetDescription>
        </SheetHeader>

        <div className="border-hairline border-b px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "flex min-w-fit flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-xs transition-colors",
                    tab === item.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{item.label}</span>
                  {item.id === "checklist" && pendingComplianceCount > 0 && (
                    <span className="rounded-full bg-[#b9822f]/15 px-1.5 py-0.5 font-mono text-[#b9822f] text-[0.65rem]">
                      {pendingComplianceCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "format" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-card/45 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[0.6875rem] text-muted-foreground uppercase tracking-[0.14em]">
                    Detected Format · {targetTexFile?.path ?? "No .tex file"}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-medium text-sm">
                    {detectedPublisher ? (
                      <>
                        <span>{detectedPublisher.name}</span>
                        <span className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[0.6875rem] text-primary">
                          {detectedPublisher.columnLabel}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Standard LaTeX / Unassigned
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => syncMetadataFromSource(mainContent)}
                >
                  <RefreshCwIcon className="size-3" />
                  Sync metadata
                </Button>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-[0.75rem] text-muted-foreground uppercase tracking-[0.14em]">
                    Peer-Reviewed Publishers
                  </span>
                  <span className="text-[0.75rem] text-muted-foreground">
                    8 formats
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PUBLISHER_LIST.map((publisher) => {
                    const isSelected = publisher.id === selectedPublisherId;
                    const isDetected = detectedPublisher?.id === publisher.id;
                    return (
                      <button
                        key={publisher.id}
                        type="button"
                        onClick={() => {
                          setSelectedPublisherId(publisher.id);
                          setConfirmLoadTemplate(false);
                        }}
                        className={cn(
                          "flex flex-col rounded-lg border p-2.5 text-left transition-colors",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                            : "border-hairline bg-card/30 hover:border-primary/40 hover:bg-card/60",
                        )}
                      >
                        <div className="flex w-full items-start justify-between gap-1.5">
                          <span className="font-medium text-[0.8125rem] leading-tight">
                            {publisher.shortName}
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            {isDetected && (
                              <span className="rounded bg-[#5db8a6]/15 px-1.5 py-0.5 font-mono text-[#2a8f83] text-[0.625rem]">
                                active
                              </span>
                            )}
                            <span className="rounded border border-hairline bg-background px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground">
                              {publisher.columnLabel}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1 line-clamp-1 text-[0.7rem] text-muted-foreground">
                          {publisher.exampleJournals.slice(0, 2).join(" · ")}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2.5 rounded-lg border border-hairline bg-card/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[0.75rem] text-muted-foreground uppercase tracking-[0.14em]">
                    Manuscript Metadata
                  </span>
                  <span className="font-mono text-[0.6875rem] text-muted-foreground">
                    bib: {selectedTemplate.recommendedBibStyle}
                  </span>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="journal-meta-title"
                    className="text-[0.72rem] text-muted-foreground"
                  >
                    Title
                  </label>
                  <Input
                    id="journal-meta-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Manuscript title"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="journal-meta-authors"
                      className="text-[0.72rem] text-muted-foreground"
                    >
                      Authors
                    </label>
                    <Input
                      id="journal-meta-authors"
                      value={authors}
                      onChange={(e) => setAuthors(e.target.value)}
                      placeholder="Elena M. Vance, Marcus Chen"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="journal-meta-email"
                      className="text-[0.72rem] text-muted-foreground"
                    >
                      Email
                    </label>
                    <Input
                      id="journal-meta-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="author@university.edu"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="journal-meta-affiliation"
                    className="text-[0.72rem] text-muted-foreground"
                  >
                    Affiliation
                  </label>
                  <Input
                    id="journal-meta-affiliation"
                    value={affiliation}
                    onChange={(e) => setAffiliation(e.target.value)}
                    placeholder="Department of Mathematics, University"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="journal-meta-keywords"
                      className="text-[0.72rem] text-muted-foreground"
                    >
                      Keywords
                    </label>
                    <Input
                      id="journal-meta-keywords"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                      placeholder="keyword 1, keyword 2"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="journal-meta-subject-class"
                      className="text-[0.72rem] text-muted-foreground"
                    >
                      {selectedTemplate.subjectClassLabel}
                    </label>
                    <Input
                      id="journal-meta-subject-class"
                      value={subjectClass}
                      onChange={(e) => setSubjectClass(e.target.value)}
                      placeholder={selectedTemplate.subjectClassPlaceholder}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => void handleAdaptManuscript()}
                  disabled={!targetTexFile}
                >
                  <WandSparklesIcon className="size-4" />
                  Adapt Manuscript to {selectedTemplate.shortName}
                </Button>
                <p className="text-[0.72rem] text-muted-foreground leading-relaxed">
                  {selectedTemplate.description} Preserves all body sections,
                  equations, theorems, proofs, and citations.
                </p>

                {!confirmLoadTemplate ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setConfirmLoadTemplate(true)}
                    disabled={!targetTexFile}
                  >
                    <FileTextIcon className="size-4" />
                    Load Clean Template
                  </Button>
                ) : (
                  <div className="space-y-2 rounded-lg border border-[#b9822f]/40 bg-[#b9822f]/10 p-3">
                    <p className="text-xs leading-relaxed">
                      Replace{" "}
                      <code className="font-mono">
                        {targetTexFile?.path ?? "main.tex"}
                      </code>{" "}
                      with the clean <strong>{selectedTemplate.name}</strong>{" "}
                      starter manuscript? A snapshot is saved automatically
                      first.
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setConfirmLoadTemplate(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => void handleLoadCleanTemplate()}
                      >
                        Confirm Replace
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "snippets" && (
            <div className="space-y-5">
              <div>
                <h3 className="font-medium text-[0.75rem] text-muted-foreground uppercase tracking-[0.14em]">
                  {selectedTemplate.shortName} Frontmatter & Declarations
                </h3>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {frontmatterSnippets.map((snippet) => (
                    <button
                      key={snippet.id}
                      type="button"
                      onClick={() => insertSnippet(snippet)}
                      className="rounded-lg border border-hairline bg-card/35 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[0.8125rem]">
                          {snippet.name}
                        </span>
                        <PlusIcon className="size-3.5 shrink-0 text-primary" />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[0.72rem] text-muted-foreground leading-relaxed">
                        {snippet.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {crossPublisherSnippets.length > 0 && (
                <div>
                  <h3 className="font-medium text-[0.75rem] text-muted-foreground uppercase tracking-[0.14em]">
                    Common Publisher Blocks
                  </h3>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {crossPublisherSnippets.map((snippet) => (
                      <button
                        key={snippet.id}
                        type="button"
                        onClick={() => insertSnippet(snippet)}
                        className="rounded-lg border border-hairline bg-card/35 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card/60"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[0.8125rem]">
                            {snippet.name}
                          </span>
                          <PlusIcon className="size-3.5 shrink-0 text-primary" />
                        </div>
                        <p className="mt-1 line-clamp-2 text-[0.72rem] text-muted-foreground leading-relaxed">
                          {snippet.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-medium text-[0.75rem] text-muted-foreground uppercase tracking-[0.14em]">
                  Theorems & Proofs
                </h3>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {theoremSnippets.map((snippet) => (
                    <button
                      key={snippet.id}
                      type="button"
                      onClick={() => insertSnippet(snippet)}
                      className="rounded-lg border border-hairline bg-card/35 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[0.8125rem]">
                          {snippet.name}
                        </span>
                        <PlusIcon className="size-3.5 shrink-0 text-primary" />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[0.72rem] text-muted-foreground leading-relaxed">
                        {snippet.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-medium text-[0.75rem] text-muted-foreground uppercase tracking-[0.14em]">
                  Journal Tables & Figures
                </h3>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {tableFigureSnippets.map((snippet) => (
                    <button
                      key={snippet.id}
                      type="button"
                      onClick={() => insertSnippet(snippet)}
                      className="rounded-lg border border-hairline bg-card/35 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card/60"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[0.8125rem]">
                          {snippet.name}
                        </span>
                        <PlusIcon className="size-3.5 shrink-0 text-primary" />
                      </div>
                      <p className="mt-1 line-clamp-2 text-[0.72rem] text-muted-foreground leading-relaxed">
                        {snippet.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "checklist" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-hairline bg-card/45 px-3 py-2.5">
                <div>
                  <div className="text-[0.6875rem] text-muted-foreground uppercase tracking-[0.14em]">
                    Compliance Target
                  </div>
                  <div className="mt-0.5 font-medium text-sm">
                    {checklistPublisher.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-serif text-lg leading-none">
                    {complianceItems.filter((item) => item.passed).length}/
                    {complianceItems.length}
                  </div>
                  <div className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                    checks passed
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {complianceItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-lg border p-3",
                      item.passed
                        ? "border-[#5db8a6]/25 bg-[#5db8a6]/5"
                        : "border-[#b9822f]/30 bg-[#b9822f]/5",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        {item.passed ? (
                          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[#2a8f83]" />
                        ) : (
                          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-[#b9822f]" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-[0.875rem]">
                            {item.label}
                          </div>
                          <p className="mt-0.5 text-[0.75rem] text-muted-foreground leading-relaxed">
                            {item.detail}
                          </p>
                        </div>
                      </div>
                      {!item.passed && item.quickFixId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 text-xs"
                          onClick={() => handleQuickFix(item.quickFixId!)}
                        >
                          <CheckIcon className="size-3" />
                          {item.quickFixLabel ?? "Quick Fix"}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  setSubmissionOpen(true);
                }}
              >
                <FileCheck2Icon className="size-4" />
                Open Submission Readiness
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
