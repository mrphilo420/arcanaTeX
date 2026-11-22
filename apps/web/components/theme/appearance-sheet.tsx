"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeXmlIcon,
  FlaskConicalIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  SunIcon,
  TypeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  COMMUNITY_THEMES,
  RESEARCH_THEMES,
  SIGNATURE_THEMES,
  getTerminalTheme,
  type TerminalTheme,
} from "@/lib/editor-theme";
import { FONT_PAIRINGS } from "@/lib/font-pairings";
import { MONO_FONTS } from "@/lib/mono-fonts";
import { TEXT_SCALES } from "@/lib/text-scale";
import { cn } from "@/lib/utils";
import { useEditorPreferencesStore } from "@/stores/editor-preferences-store";

type ModeFilter = "all" | "light" | "dark";

function ThemeCard({
  theme,
  active,
  onSelect,
}: {
  theme: TerminalTheme;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col rounded-xl border p-2.5 text-left transition-all",
        active
          ? "border-primary bg-primary/8 ring-1 ring-primary/35"
          : "border-hairline bg-card/40 hover:border-primary/40 hover:bg-card/70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <span
            className="size-3.5 rounded-full border border-black/15 dark:border-white/20"
            style={{ backgroundColor: theme.colors.background }}
            title="Canvas"
          />
          <span
            className="size-3.5 rounded-full border border-black/10 dark:border-white/15"
            style={{ backgroundColor: theme.ui.primary }}
            title="Primary"
          />
          <span
            className="size-3.5 rounded-full border border-black/10 dark:border-white/15"
            style={{ backgroundColor: theme.ui.accentTeal }}
            title="Secondary accent"
          />
          <span
            className="size-3.5 rounded-full border border-black/10 dark:border-white/15"
            style={{ backgroundColor: theme.ui.accentAmber }}
            title="Highlight"
          />
        </div>
        <span className="rounded border border-hairline bg-background/70 px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground uppercase tracking-[0.08em]">
          {theme.dark ? "Dark" : "Light"}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-1.5">
        <span className="truncate font-medium text-[0.8125rem] text-foreground">
          {theme.label}
        </span>
        {active && <CheckIcon className="size-3.5 shrink-0 text-primary" />}
      </div>

      {theme.discipline && (
        <div className="truncate text-[0.6875rem] text-primary/90">
          {theme.discipline}
        </div>
      )}
      <p className="mt-0.5 line-clamp-2 text-[0.6875rem] text-muted-foreground leading-snug">
        {theme.description}
      </p>
    </button>
  );
}

export function AppearanceButton({
  className,
  iconOnly = false,
  compact = false,
}: {
  className?: string;
  iconOnly?: boolean;
  compact?: boolean;
}) {
  const themeId = useEditorPreferencesStore((s) => s.terminalThemeId);
  const setAppearanceOpen = useEditorPreferencesStore(
    (s) => s.setAppearanceOpen,
  );
  const active = getTerminalTheme(themeId);

  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? "icon" : "sm"}
      onClick={() => setAppearanceOpen(true)}
      className={cn(
        iconOnly
          ? compact
            ? "size-6"
            : "size-8"
          : "h-8 gap-1.5 px-2.5 text-[13px]",
        "text-foreground/85 hover:bg-accent hover:text-foreground",
        className,
      )}
      title={`Appearance studio · Theme: ${active.label}`}
      aria-label={`Appearance studio (${active.label})`}
    >
      <span
        className="size-2.5 shrink-0 rounded-full border border-black/20 dark:border-white/25"
        style={{ backgroundColor: active.ui.primary }}
        aria-hidden="true"
      />
      <PaletteIcon className={cn(compact ? "size-3.5" : "size-4")} />
      {!iconOnly && <span className="hidden xl:inline">{active.label}</span>}
    </Button>
  );
}

export function AppearanceSheet() {
  const isOpen = useEditorPreferencesStore((s) => s.isAppearanceOpen);
  const setOpen = useEditorPreferencesStore((s) => s.setAppearanceOpen);
  const terminalThemeId = useEditorPreferencesStore((s) => s.terminalThemeId);
  const setTerminalThemeId = useEditorPreferencesStore(
    (s) => s.setTerminalThemeId,
  );
  const fontPairingId = useEditorPreferencesStore((s) => s.fontPairingId);
  const setFontPairingId = useEditorPreferencesStore((s) => s.setFontPairingId);
  const monoFontId = useEditorPreferencesStore((s) => s.monoFontId);
  const setMonoFontId = useEditorPreferencesStore((s) => s.setMonoFontId);
  const textScaleId = useEditorPreferencesStore((s) => s.textScaleId);
  const setTextScaleId = useEditorPreferencesStore((s) => s.setTextScaleId);
  const resetAppearance = useEditorPreferencesStore((s) => s.resetAppearance);

  const { theme: colorMode, setTheme: setColorMode } = useTheme();
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [showCommunity, setShowCommunity] = useState(false);

  const activeTheme = getTerminalTheme(terminalThemeId);
  const activePairing =
    FONT_PAIRINGS.find((item) => item.id === fontPairingId) ?? FONT_PAIRINGS[0];
  const activeMono =
    MONO_FONTS.find((item) => item.id === monoFontId) ?? MONO_FONTS[0];

  const matchesFilter = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (theme: TerminalTheme) => {
      if (modeFilter === "light" && theme.dark) return false;
      if (modeFilter === "dark" && !theme.dark) return false;
      if (!query) return true;
      return (
        theme.label.toLowerCase().includes(query) ||
        theme.id.toLowerCase().includes(query) ||
        (theme.discipline ?? "").toLowerCase().includes(query) ||
        theme.description.toLowerCase().includes(query)
      );
    };
  }, [modeFilter, search]);

  const filteredResearch = useMemo(
    () => RESEARCH_THEMES.filter(matchesFilter),
    [matchesFilter],
  );
  const filteredSignature = useMemo(
    () => SIGNATURE_THEMES.filter(matchesFilter),
    [matchesFilter],
  );
  const filteredCommunity = useMemo(
    () => COMMUNITY_THEMES.filter(matchesFilter),
    [matchesFilter],
  );

  const communityExpanded =
    showCommunity ||
    search.trim().length > 0 ||
    activeTheme.category === "community";

  return (
    <Sheet open={isOpen} onOpenChange={setOpen} modal={false}>
      <SheetContent
        overlay={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[540px]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-hairline border-b px-4 py-3 pr-12">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FlaskConicalIcon className="size-4 text-primary" />
            Research appearance studio
          </SheetTitle>
          <SheetDescription className="text-xs">
            Curated themes for mathematicians, scientists, and researchers
            paired with scholarly typography. Changes apply live.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          {/* Live Scholarly Specimen */}
          <div className="rounded-2xl border border-hairline bg-card/45 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[0.6875rem] text-muted-foreground">
              <span className="font-medium uppercase tracking-[0.12em]">
                Live manuscript preview
              </span>
              <span className="rounded-full border border-hairline bg-background/75 px-2 py-0.5 font-mono text-[0.65rem] text-foreground">
                {activeTheme.label} · {activePairing.serif} ·{" "}
                {activeMono.family}
              </span>
            </div>

            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-hairline bg-background p-3">
                <div
                  className="font-semibold text-[0.95rem] text-foreground leading-snug"
                  style={{ fontFamily: activePairing.serifCss }}
                >
                  Theorem 1.4 (Spectral Gap)
                </div>
                <p
                  className="mt-1 text-[0.75rem] text-muted-foreground leading-relaxed"
                  style={{ fontFamily: activePairing.sansCss }}
                >
                  Every self-adjoint operator on a compact manifold admits an
                  orthogonal eigenbasis in{" "}
                  <span style={{ fontFamily: activePairing.serifCss }}>
                    L²(M)
                  </span>
                  .
                </p>
              </div>

              <div
                className="rounded-xl border p-3 text-[0.72rem] leading-relaxed"
                style={{
                  backgroundColor: activeTheme.colors.background,
                  borderColor: activeTheme.colors.border,
                  color: activeTheme.colors.foreground,
                  fontFamily: activeMono.cssFamily,
                }}
              >
                <div style={{ color: activeTheme.colors.comment }}>
                  % AMS / Lean proof block
                </div>
                <div>
                  <span style={{ color: activeTheme.colors.keyword }}>
                    \begin&#123;theorem&#125;
                  </span>
                  [Parseval]
                </div>
                <div>
                  {"  "}
                  <span style={{ color: activeTheme.colors.operator }}>
                    \sum
                  </span>
                  _&#123;n=1&#125;^\infty |\hat&#123;f&#125;(n)|^2 ={" "}
                  <span style={{ color: activeTheme.colors.function }}>
                    \|f\|_2^2
                  </span>
                </div>
                <div>
                  <span style={{ color: activeTheme.colors.keyword }}>
                    \end&#123;theorem&#125;
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Themes Section */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-medium text-sm">
                <PaletteIcon className="size-4 text-primary" />
                Themes
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-hairline bg-card/50 p-0.5">
                {(["all", "light", "dark"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setModeFilter(mode)}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[0.7rem] capitalize transition-colors",
                      modeFilter === mode
                        ? "bg-background font-medium text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search themes (Chalkboard, Observatory, Principia, Nord...)"
                aria-label="Search themes"
                className="h-8 border-hairline bg-card/40 pl-8 text-xs"
              />
            </div>

            {filteredResearch.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[0.6875rem] text-muted-foreground uppercase tracking-[0.14em]">
                  <span>
                    Mathematics &amp; Science ({filteredResearch.length})
                  </span>
                  <span>Light &amp; Dark</span>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {filteredResearch.map((theme) => (
                    <ThemeCard
                      key={theme.id}
                      theme={theme}
                      active={theme.id === terminalThemeId}
                      onSelect={() => setTerminalThemeId(theme.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredSignature.length > 0 && (
              <div className="space-y-2">
                <div className="text-[0.6875rem] text-muted-foreground uppercase tracking-[0.14em]">
                  Arcana Signature
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {filteredSignature.map((theme) => (
                    <ThemeCard
                      key={theme.id}
                      theme={theme}
                      active={theme.id === terminalThemeId}
                      onSelect={() => setTerminalThemeId(theme.id)}
                    />
                  ))}
                </div>

                {terminalThemeId === "arcana" && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-card/40 px-3 py-2 text-xs">
                    <span className="text-muted-foreground">
                      Arcana color mode
                    </span>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { id: "light", label: "Light", Icon: SunIcon },
                          { id: "dark", label: "Dark", Icon: MoonIcon },
                          { id: "system", label: "System", Icon: MonitorIcon },
                        ] as const
                      ).map(({ id, label, Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setColorMode(id)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded border px-2 py-1 text-[0.7rem] transition-colors",
                            colorMode === id
                              ? "border-primary/40 bg-primary/10 font-medium text-primary"
                              : "border-hairline text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Icon className="size-3" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {filteredCommunity.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowCommunity((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-lg border border-hairline bg-card/30 px-3 py-2 text-left text-xs transition-colors hover:bg-card/60"
                >
                  <span className="font-medium text-foreground">
                    Community &amp; editor palettes ({filteredCommunity.length})
                  </span>
                  {communityExpanded ? (
                    <ChevronDownIcon className="size-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRightIcon className="size-3.5 text-muted-foreground" />
                  )}
                </button>
                {communityExpanded && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {filteredCommunity.map((theme) => {
                      const active = theme.id === terminalThemeId;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => setTerminalThemeId(theme.id)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                            active
                              ? "border-primary bg-primary/8 text-foreground"
                              : "border-hairline bg-card/30 text-foreground hover:border-primary/40",
                          )}
                        >
                          <span
                            className="size-3 shrink-0 rounded-full border"
                            style={{
                              backgroundColor: theme.colors.background,
                              borderColor: theme.colors.accent,
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate text-xs">
                            {theme.label}
                          </span>
                          <span className="text-[0.625rem] text-muted-foreground">
                            {theme.dark ? "D" : "L"}
                          </span>
                          {active && (
                            <CheckIcon className="size-3 shrink-0 text-primary" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {filteredResearch.length === 0 &&
              filteredSignature.length === 0 &&
              filteredCommunity.length === 0 && (
                <div className="rounded-lg border border-hairline bg-card/30 p-4 text-center text-muted-foreground text-xs">
                  No themes matched &ldquo;{search}&rdquo;.
                </div>
              )}
          </section>

          {/* Font Rebrand Section */}
          <section className="space-y-3 border-hairline border-t pt-5">
            <div className="flex items-center gap-1.5 font-medium text-sm">
              <SparklesIcon className="size-4 text-primary" />
              Scholarly typography
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FONT_PAIRINGS.map((pairing) => {
                const active = pairing.id === fontPairingId;
                return (
                  <button
                    key={pairing.id}
                    type="button"
                    onClick={() => setFontPairingId(pairing.id)}
                    className={cn(
                      "flex flex-col rounded-xl border p-2.5 text-left transition-all",
                      active
                        ? "border-primary bg-primary/8 ring-1 ring-primary/35"
                        : "border-hairline bg-card/35 hover:border-primary/40 hover:bg-card/65",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="truncate font-semibold text-[0.9rem] text-foreground"
                        style={{ fontFamily: pairing.serifCss }}
                      >
                        {pairing.label}
                      </span>
                      {active && (
                        <CheckIcon className="size-3.5 shrink-0 text-primary" />
                      )}
                    </div>
                    <div className="mt-0.5 text-[0.6875rem] text-primary/90">
                      {pairing.discipline}
                    </div>
                    <p
                      className="mt-1 line-clamp-2 text-[0.6875rem] text-muted-foreground leading-snug"
                      style={{ fontFamily: pairing.sansCss }}
                    >
                      {pairing.description}
                    </p>
                    <div className="mt-1.5 truncate font-mono text-[0.625rem] text-muted-foreground">
                      {pairing.serif} · {pairing.sans}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Code Mono Font Section */}
          <section className="space-y-2.5 border-hairline border-t pt-5">
            <div className="flex items-center gap-1.5 font-medium text-sm">
              <CodeXmlIcon className="size-4 text-primary" />
              LaTeX &amp; Lean code font
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MONO_FONTS.map((font) => {
                const active = font.id === monoFontId;
                return (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => setMonoFontId(font.id)}
                    className={cn(
                      "flex flex-col rounded-xl border p-2.5 text-left transition-all",
                      active
                        ? "border-primary bg-primary/8 ring-1 ring-primary/35"
                        : "border-hairline bg-card/35 hover:border-primary/40 hover:bg-card/65",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-foreground text-xs">
                        {font.label}
                      </span>
                      {active && (
                        <CheckIcon className="size-3.5 shrink-0 text-primary" />
                      )}
                    </div>
                    <div
                      className="mt-1 truncate rounded border border-hairline/70 bg-background/60 px-2 py-1 text-[0.7rem] text-foreground"
                      style={{ fontFamily: font.cssFamily }}
                    >
                      \forall x \in \mathbb&#123;R&#125;, x^2 \ge 0
                    </div>
                    <p className="mt-1 line-clamp-2 text-[0.6875rem] text-muted-foreground leading-snug">
                      {font.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Text Scale Section */}
          <section className="space-y-2.5 border-hairline border-t pt-5">
            <div className="flex items-center gap-1.5 font-medium text-sm">
              <TypeIcon className="size-4 text-primary" />
              Reading scale
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TEXT_SCALES.map((scale) => {
                const active = scale.id === textScaleId;
                return (
                  <button
                    key={scale.id}
                    type="button"
                    onClick={() => setTextScaleId(scale.id)}
                    className={cn(
                      "rounded-lg border px-2.5 py-2 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/8 ring-1 ring-primary/30"
                        : "border-hairline bg-card/35 hover:border-primary/40",
                    )}
                  >
                    <div className="font-medium text-foreground text-xs">
                      {scale.label}
                    </div>
                    <div className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                      {scale.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-hairline border-t bg-card/35 px-4 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetAppearance}
            className="gap-1.5 text-muted-foreground text-xs hover:text-foreground"
          >
            <RotateCcwIcon className="size-3.5" />
            Reset defaults
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
