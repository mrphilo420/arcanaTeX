import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

export interface EditorDiagnosticMark {
  line: number;
  severity: "error" | "warning" | "info";
  message?: string;
}

export const setEditorDiagnostics =
  StateEffect.define<EditorDiagnosticMark[]>();

const SEVERITY_RANK: Record<EditorDiagnosticMark["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function defaultMessageForSeverity(
  severity: EditorDiagnosticMark["severity"],
): string {
  if (severity === "error") return "Compile error on this line";
  if (severity === "warning") return "Warning on this line";
  return "Diagnostic note on this line";
}

function classForSeverity(severity: EditorDiagnosticMark["severity"]): string {
  if (severity === "error") return "cm-diagnostic-error";
  if (severity === "warning") return "cm-diagnostic-warning";
  return "cm-diagnostic-info";
}

const diagnosticsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);

    for (const effect of transaction.effects) {
      if (!effect.is(setEditorDiagnostics)) continue;

      const byLine = new Map<
        number,
        {
          severity: EditorDiagnosticMark["severity"];
          messages: string[];
        }
      >();

      for (const mark of effect.value) {
        if (mark.line < 1 || mark.line > transaction.state.doc.lines) continue;
        const existing = byLine.get(mark.line);
        const msg = mark.message?.trim();

        if (!existing) {
          byLine.set(mark.line, {
            severity: mark.severity,
            messages: msg ? [msg] : [],
          });
          continue;
        }

        if (SEVERITY_RANK[mark.severity] < SEVERITY_RANK[existing.severity]) {
          existing.severity = mark.severity;
        }
        if (msg && !existing.messages.includes(msg)) {
          existing.messages.push(msg);
        }
      }

      const sortedLines = [...byLine.keys()].sort((a, b) => a - b);
      const builder = new RangeSetBuilder<Decoration>();

      for (const lineNumber of sortedLines) {
        const entry = byLine.get(lineNumber);
        if (!entry) continue;
        const line = transaction.state.doc.line(lineNumber);
        const title =
          entry.messages.length > 0
            ? entry.messages.join("\n")
            : defaultMessageForSeverity(entry.severity);
        builder.add(
          line.from,
          line.from,
          Decoration.line({
            class: classForSeverity(entry.severity),
            attributes: { title },
          }),
        );
      }

      next = builder.finish();
    }

    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const diagnosticHighlightExtension = diagnosticsField;
