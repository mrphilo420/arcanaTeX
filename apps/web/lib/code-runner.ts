import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

export type CodeLanguage = "python" | "r";

export interface CodeInputFile {
  path: string;
  content: string;
}

export interface CodeArtifact {
  path: string;
  content: string;
  truncated: boolean;
  encoding?: "utf-8" | "base64";
  mimeType?: string;
  bytes?: number;
}

export interface CodeRunResult {
  success: boolean;
  language: CodeLanguage;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  artifacts: CodeArtifact[];
  sandboxed: boolean;
  warning?: string;
}

export interface CodeRuntimeStatus {
  available: boolean;
  binary: string;
  version?: string;
  packages: string[];
}

export interface CodeRuntimesProbe {
  python: CodeRuntimeStatus;
  r: CodeRuntimeStatus;
}

const DEFAULT_TIMEOUT_MS = 35_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_CODE_CHARS = 60_000;
export const MAX_INPUT_FILES = 16;
export const MAX_INPUT_FILE_CHARS = 200_000;
const MAX_OUTPUT_CHARS = 14_000;
const MAX_ERROR_CHARS = 7_000;
const MAX_ARTIFACTS = 20;
const MAX_TEXT_ARTIFACT_CHARS = 500_000;
const MAX_TEXT_ARTIFACT_BYTES = 1_000_000;
const MAX_BINARY_ARTIFACT_BYTES = 2_000_000;
const MAX_ARTIFACT_TOTAL_CHARS = 5_000_000;

const TEXT_ARTIFACT_EXTENSIONS = new Set([
  ".tex",
  ".tikz",
  ".pgf",
  ".svg",
  ".csv",
  ".tsv",
  ".dat",
  ".json",
  ".txt",
  ".md",
  ".log",
  ".py",
  ".r",
]);

const BINARY_ARTIFACT_EXTENSIONS = new Set([
  ".png",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".eps",
]);

const ARTIFACT_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".eps": "application/postscript",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".tex": "application/x-tex",
  ".tikz": "application/x-tex",
  ".pgf": "application/x-tex",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".log": "text/plain",
  ".dat": "text/plain",
  ".py": "text/x-python",
  ".r": "text/x-r",
};

const SKIP_DIRECTORIES = new Set([
  ".cache",
  ".mpl",
  "__pycache__",
  "node_modules",
]);

function clampTimeout(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(MAX_TIMEOUT_MS, Math.max(1_000, Math.round(value)));
}

function safeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.includes("\0") ||
    normalized.startsWith("~")
  ) {
    throw new Error(`Invalid file path: ${value}`);
  }
  return normalized;
}

let sharedMplCacheDirPromise: Promise<string> | null = null;

/**
 * Returns a persistent shared Matplotlib cache directory across Python runs
 * so Matplotlib does not rescan OS fonts on every figure compilation.
 */
function ensureSharedMplCacheDir(): Promise<string> {
  if (!sharedMplCacheDirPromise) {
    const dir = join(tmpdir(), "arcanatex-mpl-cache");
    sharedMplCacheDirPromise = mkdir(dir, { recursive: true })
      .then(() => realpath(dir))
      .catch((error) => {
        sharedMplCacheDirPromise = null;
        throw error;
      });
  }
  return sharedMplCacheDirPromise;
}

function escapeSandboxPath(pathValue: string): string {
  return pathValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function macSandboxProfile(root: string, mplCacheDir?: string): string {
  const escapedRoot = escapeSandboxPath(root);
  const escapedMplCache = mplCacheDir ? escapeSandboxPath(mplCacheDir) : null;
  const home = process.env.HOME;
  const escapedHome =
    home && !root.startsWith(`${home}/`) ? escapeSandboxPath(home) : null;
  const mplWriteRule = escapedMplCache ? `(subpath "${escapedMplCache}") ` : "";
  return [
    "(version 1)",
    "(allow default)",
    "(deny network*)",
    "(deny file-write*)",
    escapedHome ? `(deny file-read* (subpath "${escapedHome}"))` : "",
    `(allow file-write* (subpath "${escapedRoot}") ${mplWriteRule}(literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr"))`,
  ]
    .filter(Boolean)
    .join("\n");
}

const SAFE_ENV_KEYS = [
  "NODE_ENV",
  "PATH",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TZ",
  "SYSTEMROOT",
];

function shellEnvironment(
  root: string,
  mplCacheDir?: string,
): NodeJS.ProcessEnv {
  const safeEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV ?? "production",
  };
  for (const key of SAFE_ENV_KEYS) {
    const value = process.env[key];
    if (value) safeEnvironment[key] = value;
  }

  return {
    ...safeEnvironment,
    HOME: root,
    TMPDIR: root,
    TMP: root,
    TEMP: root,
    XDG_CACHE_HOME: mplCacheDir ?? join(root, ".cache"),
    MPLCONFIGDIR: mplCacheDir ?? join(root, ".mpl"),
    MPLBACKEND: "Agg",
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    R_HISTFILE: "/dev/null",
    R_ENVIRON_USER: "/dev/null",
    R_PROFILE_USER: "/dev/null",
  };
}

async function collectArtifacts(
  root: string,
  inputSnapshots?: ReadonlyMap<string, string>,
): Promise<CodeArtifact[]> {
  const artifacts: CodeArtifact[] = [];
  let total = 0;

  const visit = async (directory: string): Promise<void> => {
    if (
      artifacts.length >= MAX_ARTIFACTS ||
      total >= MAX_ARTIFACT_TOTAL_CHARS
    ) {
      return;
    }

    let entries: Array<{
      name: string;
      isDirectory: () => boolean;
      isFile: () => boolean;
    }>;
    try {
      entries = await readdir(directory, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return;
    }

    for (const entry of entries) {
      if (
        artifacts.length >= MAX_ARTIFACTS ||
        total >= MAX_ARTIFACT_TOTAL_CHARS
      ) {
        break;
      }
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) {
          await visit(join(directory, entry.name));
        }
        continue;
      }
      if (!entry.isFile()) continue;

      const path = join(directory, entry.name);
      const relativePath = relative(root, path).replace(/\\/g, "/");
      if (relativePath === "main.py" || relativePath === "main.R") continue;
      const extension = relativePath.includes(".")
        ? relativePath.slice(relativePath.lastIndexOf(".")).toLowerCase()
        : "";

      const isText = TEXT_ARTIFACT_EXTENSIONS.has(extension);
      const isBinary = BINARY_ARTIFACT_EXTENSIONS.has(extension);
      if (!isText && !isBinary) continue;

      let info;
      try {
        info = await lstat(path);
      } catch {
        continue;
      }
      if (!info.isFile()) continue;

      const mimeType = ARTIFACT_MIME_TYPES[extension] ?? "text/plain";

      if (isBinary) {
        if (info.size > MAX_BINARY_ARTIFACT_BYTES) continue;
        let buffer: Buffer;
        try {
          buffer = await readFile(path);
        } catch {
          continue;
        }
        if (
          inputSnapshots?.has(relativePath) &&
          buffer.toString("utf-8") === inputSnapshots.get(relativePath)
        ) {
          continue;
        }
        const encoded = buffer.toString("base64");
        if (total + encoded.length > MAX_ARTIFACT_TOTAL_CHARS) continue;
        total += encoded.length;
        artifacts.push({
          path: relativePath,
          content: encoded,
          truncated: false,
          encoding: "base64",
          mimeType,
          bytes: buffer.byteLength,
        });
        continue;
      }

      if (info.size > MAX_TEXT_ARTIFACT_BYTES) continue;

      let content: string;
      try {
        content = await readFile(path, "utf-8");
      } catch {
        continue;
      }
      if (
        inputSnapshots?.has(relativePath) &&
        content === inputSnapshots.get(relativePath)
      ) {
        continue;
      }

      const remaining = MAX_ARTIFACT_TOTAL_CHARS - total;
      if (remaining <= 0) break;
      const limit = Math.min(MAX_TEXT_ARTIFACT_CHARS, remaining);
      const included = content.slice(0, limit);
      total += included.length;
      artifacts.push({
        path: relativePath,
        content: included,
        truncated: included.length < content.length,
        encoding: "utf-8",
        mimeType,
        bytes: Buffer.byteLength(content, "utf-8"),
      });
    }
  };

  await visit(root);
  return artifacts;
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  mplCacheDir?: string,
): Promise<{
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      env: shellEnvironment(cwd, mplCacheDir),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const append = (
      current: string,
      chunk: Buffer,
      limit: number,
      truncated: boolean,
    ): { value: string; truncated: boolean } => {
      if (current.length >= limit) return { value: current, truncated: true };
      const text = chunk.toString();
      return {
        value: current + text.slice(0, limit - current.length),
        truncated: truncated || text.length > limit - current.length,
      };
    };

    proc.stdout.on("data", (chunk: Buffer) => {
      const next = append(stdout, chunk, MAX_OUTPUT_CHARS, stdoutTruncated);
      stdout = next.value;
      stdoutTruncated = next.truncated;
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      const next = append(stderr, chunk, MAX_ERROR_CHARS, stderrTruncated);
      stderr = next.value;
      stderrTruncated = next.truncated;
    });

    const finish = (exitCode: number | null, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        timedOut,
        stdout: stdoutTruncated ? `${stdout}\n… output truncated …` : stdout,
        stderr: stderrTruncated ? `${stderr}\n… output truncated …` : stderr,
        error,
      });
    };

    timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);

    proc.on("close", (code) => finish(code));
    proc.on("error", (error) => finish(null, error.message));
  });
}

let cachedProbe: { at: number; value: CodeRuntimesProbe } | null = null;
const PROBE_CACHE_TTL_MS = 30_000;

export async function probeCodeRuntimes(options?: {
  force?: boolean;
}): Promise<CodeRuntimesProbe> {
  if (
    !options?.force &&
    cachedProbe &&
    Date.now() - cachedProbe.at < PROBE_CACHE_TTL_MS
  ) {
    return cachedProbe.value;
  }

  const pythonBinary = process.env.PYTHON_BIN || "python3";
  const rBinary = process.env.R_BIN || "Rscript";
  const probeRoot = await realpath(
    await mkdtemp(join(tmpdir(), "arcanatex-probe-")),
  );

  try {
    await mkdir(join(probeRoot, ".cache"), { recursive: true });
    await mkdir(join(probeRoot, ".mpl"), { recursive: true });

    const [pythonStatus, rStatus] = await Promise.all([
      (async (): Promise<CodeRuntimeStatus> => {
        const script = [
          "import importlib.util, json, platform",
          'candidates = ("numpy", "matplotlib", "scipy", "pandas", "seaborn", "networkx")',
          "pkgs = [p for p in candidates if importlib.util.find_spec(p) is not None]",
          'print(json.dumps({"version": platform.python_version(), "packages": pkgs}))',
        ].join("; ");
        const res = await runProcess(
          pythonBinary,
          ["-c", script],
          probeRoot,
          12_000,
        );
        if (res.exitCode !== 0 || res.error || res.timedOut) {
          return { available: false, binary: pythonBinary, packages: [] };
        }
        try {
          const lines = res.stdout.trim().split("\n");
          const lastLine = lines[lines.length - 1] ?? "{}";
          const parsed = JSON.parse(lastLine) as {
            version?: string;
            packages?: string[];
          };
          return {
            available: true,
            binary: pythonBinary,
            version: parsed.version,
            packages: Array.isArray(parsed.packages) ? parsed.packages : [],
          };
        } catch {
          return {
            available: true,
            binary: pythonBinary,
            packages: [],
          };
        }
      })(),
      (async (): Promise<CodeRuntimeStatus> => {
        const script = [
          'pkgs <- c("ggplot2", "scales", "grid", "grDevices", "stats", "graphics")',
          "avail <- pkgs[sapply(pkgs, function(p) requireNamespace(p, quietly = TRUE))]",
          'cat(sprintf("%s|%s\\n", as.character(getRversion()), paste(avail, collapse = ",")))',
        ].join("; ");
        const res = await runProcess(
          rBinary,
          ["--vanilla", "-e", script],
          probeRoot,
          12_000,
        );
        if (res.exitCode !== 0 || res.error || res.timedOut) {
          return { available: false, binary: rBinary, packages: [] };
        }
        const line = res.stdout.trim().split("\n").pop() ?? "";
        const [version, pkgCsv] = line.split("|");
        const packages = pkgCsv
          ? pkgCsv
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : [];
        return {
          available: true,
          binary: rBinary,
          version: version || undefined,
          packages,
        };
      })(),
    ]);

    const value: CodeRuntimesProbe = {
      python: pythonStatus,
      r: rStatus,
    };
    cachedProbe = { at: Date.now(), value };
    return value;
  } finally {
    await rm(probeRoot, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runLocalCode(input: {
  language: CodeLanguage;
  code: string;
  files?: CodeInputFile[];
  timeoutMs?: number;
}): Promise<CodeRunResult> {
  if (process.env.ENABLE_LOCAL_CODE_EXECUTION === "false") {
    throw new Error(
      "Local code execution is disabled. Set ENABLE_LOCAL_CODE_EXECUTION=true to enable Python and R tools.",
    );
  }

  const code = input.code.trim();
  if (!code) {
    throw new Error("No code was provided.");
  }
  if (code.length > MAX_CODE_CHARS) {
    throw new Error(`Code is too large (limit ${MAX_CODE_CHARS} characters).`);
  }

  const files = (input.files ?? []).slice(0, MAX_INPUT_FILES);
  for (const file of files) {
    if (file.content.length > MAX_INPUT_FILE_CHARS) {
      throw new Error(
        `Input file ${file.path} is too large (limit ${MAX_INPUT_FILE_CHARS} characters).`,
      );
    }
  }

  const root = await realpath(await mkdtemp(join(tmpdir(), "arcanatex-code-")));
  const timeoutMs = clampTimeout(input.timeoutMs);
  const startedAt = Date.now();
  const scriptName = input.language === "python" ? "main.py" : "main.R";
  const binary =
    input.language === "python"
      ? process.env.PYTHON_BIN || "python3"
      : process.env.R_BIN || "Rscript";
  const args =
    input.language === "python" ? [scriptName] : ["--vanilla", scriptName];

  try {
    await mkdir(join(root, ".cache"), { recursive: true });
    await mkdir(join(root, ".mpl"), { recursive: true });
    const mplCacheDir =
      input.language === "python"
        ? await ensureSharedMplCacheDir().catch(() => join(root, ".mpl"))
        : undefined;

    const inputSnapshots = new Map<string, string>();
    for (const file of files) {
      const relativePath = safeRelativePath(file.path);
      const fullPath = join(root, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, "utf-8");
      inputSnapshots.set(relativePath, file.content);
    }
    await writeFile(join(root, scriptName), code, "utf-8");

    const useMacSandbox =
      process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec");
    const allowUnsandboxed =
      process.env.ALLOW_UNSANDBOXED_CODE_EXECUTION === "true";

    if (!useMacSandbox && !allowUnsandboxed) {
      throw new Error(
        "No supported local code sandbox is available on this platform. Install a sandboxed runtime or set ALLOW_UNSANDBOXED_CODE_EXECUTION=true to run trusted code without network isolation.",
      );
    }

    const command = useMacSandbox ? "/usr/bin/sandbox-exec" : binary;
    const commandArgs = useMacSandbox
      ? ["-p", macSandboxProfile(root, mplCacheDir), binary, ...args]
      : args;

    let result = await runProcess(
      command,
      commandArgs,
      root,
      timeoutMs,
      mplCacheDir,
    );
    if (
      useMacSandbox &&
      result.exitCode === 71 &&
      result.stderr.includes("sandbox_apply: Operation not permitted")
    ) {
      // The host process is already running inside an active macOS Seatbelt sandbox,
      // which forbids nested sandbox_apply calls. Run inside the active outer sandbox.
      result = await runProcess(binary, args, root, timeoutMs, mplCacheDir);
    }

    const artifacts = await collectArtifacts(root, inputSnapshots);
    const durationMs = Date.now() - startedAt;
    const success = !result.timedOut && !result.error && result.exitCode === 0;

    return {
      success,
      language: input.language,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs,
      stdout: result.stdout,
      stderr: result.stderr || result.error || "",
      artifacts,
      sandboxed: useMacSandbox,
      warning: useMacSandbox
        ? undefined
        : "No OS sandbox is available on this platform. Code ran in an isolated temporary directory with a timeout, but without network isolation. Set ALLOW_UNSANDBOXED_CODE_EXECUTION=true only when you trust the code.",
    };
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
}
