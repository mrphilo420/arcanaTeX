import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, normalize, sep } from "node:path";
import { buildFilePatch, type FilePatch } from "./line-diff";

export interface AgentFile {
  path: string;
  content: string;
}

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | {
      type: "result";
      text: string;
      costUsd?: number;
      durationMs?: number;
    }
  | { type: "changes"; files: AgentChange[] };

export interface AgentChange {
  path: string;
  patch: FilePatch;
}

const MAX_FILES = 200;
const MAX_FILE_BYTES = 2_000_000;

function safeRelativePath(path: string): string | null {
  const normalized = normalize(path.replace(/^\/+/, ""));
  if (!normalized || normalized.startsWith("..")) return null;
  if (normalized.includes(`..${sep}`)) return null;
  if (normalized.split(sep).some((part) => part === ".git")) return null;
  return normalized;
}

async function writeWorkspace(root: string, files: AgentFile[]): Promise<void> {
  for (const file of files.slice(0, MAX_FILES)) {
    const relative = safeRelativePath(file.path);
    if (!relative) continue;
    if (file.content.length > MAX_FILE_BYTES) continue;
    const target = join(root, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
}

async function walk(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      found.push(...(await walk(root, relative)));
    } else if (entry.isFile()) {
      found.push(relative);
    }
  }
  return found;
}

async function collectChanges(
  root: string,
  original: AgentFile[],
): Promise<AgentChange[]> {
  const before = new Map(original.map((file) => [file.path, file.content]));
  const changed: AgentChange[] = [];

  for (const relative of await walk(root)) {
    const target = join(root, relative);
    const info = await stat(target);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) continue;
    const content = await readFile(target, "utf8");
    const previous = before.get(relative);
    if (previous === content) continue;

    const patch = buildFilePatch(previous ?? "", content);
    const hasChange = patch.kind === "replace" || patch.edits.length > 0;
    if (hasChange) {
      changed.push({ path: relative, patch });
    }
  }

  return changed;
}

function buildPrompt(context: string, prompt: string): string {
  return [
    "You are working inside a LaTeX project exported to this directory.",
    "Edit files directly when the user asks for a change; otherwise answer in chat and change nothing.",
    "Keep the project compilable. Do not delete files unless asked.",
    "",
    "The editor state follows:",
    context,
    "",
    "User request:",
    prompt,
  ].join("\n");
}

/**
 * Runs one agent turn in an isolated copy of the project and yields incremental
 * text plus the files the agent changed.
 *
 * The workspace is deleted when the turn ends; nothing is written back to the
 * browser until the caller applies the returned changes.
 */
export async function* runAgentTurn(input: {
  prompt: string;
  context?: string;
  files: AgentFile[];
  signal?: AbortSignal;
  command?: string;
}): AsyncGenerator<AgentEvent> {
  const root = await mkdtemp(join(tmpdir(), "arcana-agent-"));
  const command = input.command ?? "claude";
  const startedAt = Date.now();

  try {
    await writeWorkspace(root, input.files);

    const child = spawn(
      command,
      [
        "-p",
        buildPrompt(input.context ?? "", input.prompt),
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--permission-mode",
        "acceptEdits",
      ],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"], signal: input.signal },
    );

    let buffer = "";
    let finalText = "";
    let costUsd: number | undefined;
    let stderr = "";

    const events: AgentEvent[] = [];
    let notify: (() => void) | null = null;
    let finished = false;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          try {
            const parsed = JSON.parse(line) as {
              type?: string;
              event?: {
                type?: string;
                delta?: { type?: string; text?: string };
              };
              result?: string;
              total_cost_usd?: number;
              message?: { content?: Array<{ type?: string; name?: string }> };
            };
            if (
              parsed.type === "stream_event" &&
              parsed.event?.type === "content_block_delta" &&
              parsed.event.delta?.type === "text_delta" &&
              parsed.event.delta.text
            ) {
              events.push({ type: "text", text: parsed.event.delta.text });
            } else if (parsed.type === "assistant" && parsed.message?.content) {
              for (const block of parsed.message.content) {
                if (block.type === "tool_use" && block.name) {
                  events.push({ type: "tool", name: block.name });
                }
              }
            } else if (parsed.type === "result") {
              finalText = parsed.result ?? "";
              costUsd = parsed.total_cost_usd;
            }
          } catch {
            // Partial or non-JSON line; ignore.
          }
        }
        notify?.();
        newline = buffer.indexOf("\n");
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2_000);
    });

    child.on("close", () => {
      finished = true;
      notify?.();
    });

    child.on("error", (error) => {
      stderr = `${stderr}\n${error.message}`.slice(-2_000);
      finished = true;
      notify?.();
    });

    while (!finished || events.length > 0) {
      if (events.length > 0) {
        yield events.shift() as AgentEvent;
        continue;
      }
      if (finished) break;
      await new Promise<void>((resolve) => {
        notify = () => {
          notify = null;
          resolve();
        };
      });
    }

    if (!finalText && stderr) {
      finalText = `The agent exited without a result. ${stderr}`;
    }

    yield {
      type: "result",
      text: finalText,
      costUsd,
      durationMs: Date.now() - startedAt,
    };

    const changed = await collectChanges(root, input.files);
    if (changed.length > 0) {
      yield { type: "changes", files: changed };
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
