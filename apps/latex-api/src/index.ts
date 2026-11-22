import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { mkdir, rm, readFile, access } from "node:fs/promises";
import { basename, delimiter, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { registerLeanRoutes } from "./lean";
import { type Resource, writeResources } from "./resources";
import { registerSyncRoutes } from "./sync";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

const MAX_CONCURRENT = 3;
const COMPILE_TIMEOUT_MS = 45000;
const TECTONIC_TIMEOUT_MS = 55000;

let activeCompilations = 0;

type CompilerName =
  | "pdflatex"
  | "xelatex"
  | "lualatex"
  | "bibtex"
  | "makeindex"
  | "tectonic";

const COMPILER_NAMES: CompilerName[] = [
  "pdflatex",
  "xelatex",
  "lualatex",
  "bibtex",
  "makeindex",
  "tectonic",
];

const MIKTEX_BIN_DIR = "/Applications/MiKTeX Console.app/Contents/bin";
const MIKTEX_ENGINES: Record<CompilerName, string> = {
  pdflatex: "miktex-pdftex",
  xelatex: "miktex-xetex",
  lualatex: "miktex-luahbtex",
  bibtex: "miktex-bibtex",
  makeindex: "miktex-makeindex",
  tectonic: "tectonic",
};

function isOnPath(command: string): boolean {
  const path = process.env.PATH ?? "";
  return path
    .split(delimiter)
    .some((directory) => directory && existsSync(join(directory, command)));
}

function ensureMiktexFallbackBin(): string | null {
  if (!existsSync(MIKTEX_BIN_DIR)) return null;

  const userSuffix =
    typeof process.getuid === "function" ? process.getuid() : "user";
  const binDir = join(tmpdir(), `arcanatex-tex-bin-${userSuffix}`);
  mkdirSync(binDir, { recursive: true, mode: 0o700 });

  let hasLinks = false;

  for (const name of COMPILER_NAMES) {
    const target = join(MIKTEX_BIN_DIR, MIKTEX_ENGINES[name]);
    if (!existsSync(target)) continue;

    const link = join(binDir, name);
    if (!existsSync(link)) {
      try {
        symlinkSync(target, link);
      } catch {
        // Another process may have created the link.
      }
    }

    if (existsSync(link)) hasLinks = true;
  }

  return hasLinks ? binDir : null;
}

const miktexFallbackBin = ensureMiktexFallbackBin();

function resolveCompilerCommand(name: CompilerName): string {
  if (isOnPath(name)) return name;

  if (miktexFallbackBin) {
    const fallback = join(miktexFallbackBin, name);
    if (existsSync(fallback)) return fallback;
  }

  return name;
}

function resolveToolCommand(name: "biber" | "tectonic"): string {
  const home = process.env.HOME;
  // Prefer Homebrew's biber. Older ~/.local/bin copies can be present and
  // incompatible with the installed biblatex version.
  const candidates = [
    join("/opt/homebrew/bin", name),
    join("/usr/local/bin", name),
    home ? join(home, "Library/TeX/texbin", name) : "",
    home ? join(home, ".local/bin", name) : "",
    name,
  ].filter(Boolean);

  return (
    candidates.find((candidate) =>
      candidate === name ? isOnPath(candidate) : existsSync(candidate),
    ) ?? name
  );
}

app.use("/*", cors());
app.use("/*", bodyLimit({ maxSize: 50 * 1024 * 1024 }));

registerSyncRoutes(app, upgradeWebSocket);
registerLeanRoutes(app);

interface CompileRequest {
  compiler?: string;
  resources: Resource[];
  includeLog?: boolean;
}

interface CompileError {
  error: string;
  log_files?: Record<string, string>;
}

app.get("/", (c) => {
  return c.json({ status: "ok", service: "latex-api" });
});

app.post("/builds/sync", async (c) => {
  if (activeCompilations >= MAX_CONCURRENT) {
    return c.json(
      { error: "Server busy, try again later" } satisfies CompileError,
      503,
    );
  }

  const body = await c.req.json<CompileRequest>();
  const { compiler = "pdflatex", resources, includeLog = false } = body;

  if (!resources || resources.length === 0) {
    return c.json(
      { error: "No resources provided" } satisfies CompileError,
      400,
    );
  }

  const mainResource = resources.find((r) => r.main) || resources[0];
  const mainPath = mainResource.path || "main.tex";
  const mainFileName = mainPath.replace(/\.(?:tex|ltx)$/i, "");
  const mainDir = dirname(mainPath);
  const mainBaseName = basename(mainPath);
  const outputBaseName = basename(mainFileName);

  const workDir = join(tmpdir(), `latex-${randomUUID()}`);
  const compileDir = mainDir === "." ? workDir : join(workDir, mainDir);
  await mkdir(workDir, { recursive: true });

  activeCompilations++;
  try {
    const hasBib = resources.some((r) => r.path?.endsWith(".bib"));
    let toolLog = "";
    const usesBiblatex = resources.some(
      (resource) =>
        typeof resource.content === "string" &&
        (/\\usepackage(?:\[[^\]]*\])?\{[^}]*\bbiblatex\b/.test(
          resource.content,
        ) ||
          /\\addbibresource\b/.test(resource.content)),
    );

    const written = await writeResources(workDir, resources);
    if (!written.ok) {
      return c.json({ error: "Invalid path" } satisfies CompileError, 400);
    }

    const runWithTimeout = (
      cmd: string[],
      timeoutMs = COMPILE_TIMEOUT_MS,
    ): Promise<{
      exitCode: number;
      timedOut: boolean;
      stdout: string;
      stderr: string;
    }> => {
      return new Promise((resolve) => {
        const [command, ...args] = cmd;
        const proc = spawn(command, args, {
          cwd: compileDir,
          env: {
            ...process.env,
            max_print_line: "1000",
            error_line: "254",
            half_error_line: "238",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let timedOut = false;
        let stdout = "";
        let stderr = "";
        const timeout = setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, timeoutMs);
        proc.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        proc.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        proc.on("close", (code) => {
          clearTimeout(timeout);
          resolve({ exitCode: code ?? 1, timedOut, stdout, stderr });
        });
        proc.on("error", () => {
          clearTimeout(timeout);
          resolve({ exitCode: 1, timedOut: false, stdout, stderr });
        });
      });
    };

    const compilerName: CompilerName =
      compiler === "tectonic"
        ? "tectonic"
        : compiler === "xelatex"
          ? "xelatex"
          : compiler === "lualatex"
            ? "lualatex"
            : "pdflatex";

    let result: {
      exitCode: number;
      timedOut: boolean;
      stdout: string;
      stderr: string;
    };

    const latexCmd = [
      resolveCompilerCommand(compilerName),
      "-interaction=nonstopmode",
      "-file-line-error",
      "-no-shell-escape",
      mainBaseName,
    ];

    const readText = async (path: string): Promise<string> => {
      try {
        return await readFile(path, "utf-8");
      } catch {
        return "";
      }
    };

    const fileExists = async (path: string): Promise<boolean> =>
      access(path)
        .then(() => true)
        .catch(() => false);

    const resolveOutputPath = async (ext: string): Promise<string> => {
      const inCompileDir = join(compileDir, `${outputBaseName}.${ext}`);
      if (await fileExists(inCompileDir)) return inCompileDir;
      const inWorkDir = join(workDir, `${outputBaseName}.${ext}`);
      if (await fileExists(inWorkDir)) return inWorkDir;
      return inCompileDir;
    };

    const readsRerunRequest = (log: string): boolean =>
      /Rerun to get cross-references right|Label\(s\) may have changed|There were undefined references|Please \(re\)run|Rerun LaTeX|rerunfilecheck/i.test(
        log,
      );

    if (compilerName === "tectonic") {
      const tectonicCommand = resolveToolCommand("tectonic");
      result = await runWithTimeout(
        [
          tectonicCommand,
          "--keep-logs",
          "--chatter",
          "minimal",
          "--untrusted",
          mainBaseName,
        ],
        TECTONIC_TIMEOUT_MS,
      );
      toolLog += `\n--- tectonic ---\n${result.stdout}${result.stderr}`;
      if (result.timedOut) {
        return c.json(
          { error: "Tectonic compilation timed out" } satisfies CompileError,
          500,
        );
      }
    } else {
      result = await runWithTimeout(latexCmd);
      if (result.timedOut) {
        return c.json(
          { error: "Compilation timed out" } satisfies CompileError,
          500,
        );
      }

      const auxPath = join(compileDir, `${outputBaseName}.aux`);
      if (hasBib) {
        if (usesBiblatex) {
          const bcfPath = join(compileDir, `${outputBaseName}.bcf`);
          if (await fileExists(bcfPath)) {
            result = await runWithTimeout([
              resolveToolCommand("biber"),
              outputBaseName,
            ]);
            toolLog += `\n--- biber ---\n${result.stdout}${result.stderr}`;
            if (result.timedOut) {
              return c.json(
                { error: "Biber timed out" } satisfies CompileError,
                500,
              );
            }
          }
        } else {
          const auxContent = await readText(auxPath);
          if (
            /\\bibdata\{/.test(auxContent) &&
            /\\citation\{/.test(auxContent)
          ) {
            result = await runWithTimeout([
              resolveCompilerCommand("bibtex"),
              outputBaseName,
            ]);
            toolLog += `\n--- bibtex ---\n${result.stdout}${result.stderr}`;
            if (result.timedOut) {
              return c.json(
                { error: "BibTeX timed out" } satisfies CompileError,
                500,
              );
            }
          }
        }
      }

      const idxPath = join(compileDir, `${outputBaseName}.idx`);
      if (await fileExists(idxPath)) {
        result = await runWithTimeout(
          [resolveCompilerCommand("makeindex"), `${outputBaseName}.idx`],
          20000,
        );
        toolLog += `\n--- makeindex ---\n${result.stdout}${result.stderr}`;
        if (result.timedOut) {
          return c.json(
            { error: "MakeIndex timed out" } satisfies CompileError,
            500,
          );
        }
      }

      let previousAux = await readText(auxPath);
      for (let i = 0; i < 2; i++) {
        result = await runWithTimeout(latexCmd);
        if (result.timedOut) {
          return c.json(
            { error: "Compilation timed out" } satisfies CompileError,
            500,
          );
        }

        const nextAux = await readText(auxPath);
        const log = await readText(await resolveOutputPath("log"));
        const needsRerun = nextAux !== previousAux || readsRerunRequest(log);
        previousAux = nextAux;
        if (!needsRerun && i >= 1) break;
      }
    }

    const pdfPath = await resolveOutputPath("pdf");
    const logPath = await resolveOutputPath("log");

    let logContent = toolLog;
    try {
      logContent += await readFile(logPath, "utf-8");
    } catch {}
    if (!logContent.trim()) {
      logContent = `${result.stdout}${result.stderr}`;
    }

    try {
      const pdfBuffer = await readFile(pdfPath);
      const log = logContent.slice(-200_000);

      if (includeLog) {
        return c.json({
          pdf: pdfBuffer.toString("base64"),
          log,
        });
      }

      return new Response(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=${mainFileName}.pdf`,
        },
      });
    } catch {
      return c.json(
        {
          error: "Compilation failed",
          log_files: {
            "__main_document__.log": logContent,
          },
        } satisfies CompileError,
        500,
      );
    }
  } finally {
    activeCompilations--;
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
});

const port = parseInt(process.env.PORT || "3001", 10);

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  () => {
    console.log(`LaTeX API server running on port ${port}`);
  },
);

injectWebSocket(server);
