import { describe, expect, it } from "vitest";
import type { ProjectFile } from "@/lib/project-files";
import {
  compileReducer,
  initialCompileState,
  isFresh,
  type CompileInputs,
  type CompileState,
} from "./compile-machine";

function files(content = "a"): ProjectFile[] {
  return [
    { id: "f1", name: "main.tex", path: "main.tex", type: "tex", content },
  ];
}

function inputs(fileList: ProjectFile[]): CompileInputs {
  return { files: fileList, mainFileId: "f1", compiler: "pdflatex" };
}

const pdf = new Uint8Array([1, 2, 3]);

function succeeded(): CompileState {
  const fileList = files();
  return compileReducer(
    compileReducer(initialCompileState(), {
      type: "start",
      projectId: "p1",
      runId: 1,
      at: 1,
    }),
    {
      type: "success",
      projectId: "p1",
      runId: 1,
      pdf,
      inputs: inputs(fileList),
      at: 2,
    },
  );
}

describe("compileReducer", () => {
  it("keeps the previous PDF while a new run is in flight", () => {
    const previous = succeeded();
    const next = compileReducer(previous, {
      type: "start",
      projectId: "p1",
      runId: 2,
      at: 3,
    });

    expect(next.phase).toBe("compiling");
    expect(next.pdf).toBe(pdf);
    expect(next.pdfInputs).toBe(previous.pdfInputs);
  });

  it("records successful inputs and reports the result fresh", () => {
    const fileList = files();
    const state = compileReducer(
      compileReducer(initialCompileState(), {
        type: "start",
        projectId: "p1",
        runId: 1,
        at: 1,
      }),
      {
        type: "success",
        projectId: "p1",
        runId: 1,
        pdf,
        inputs: inputs(fileList),
        at: 2,
      },
    );

    expect(state.phase).toBe("success");
    expect(state.pdf).toBe(pdf);
    expect(isFresh(state, inputs(fileList))).toBe(true);
  });

  it("retains the PDF after a failure", () => {
    const previous = succeeded();
    const failed = compileReducer(
      compileReducer(previous, {
        type: "start",
        projectId: "p1",
        runId: 2,
        at: 3,
      }),
      {
        type: "failure",
        projectId: "p1",
        runId: 2,
        kind: "latex",
        message: "Undefined control sequence",
        at: 4,
      },
    );

    expect(failed.phase).toBe("error");
    expect(failed.pdf).toBe(pdf);
    expect(failed.error?.kind).toBe("latex");
  });

  it("marks the retained PDF stale after an edit and a failed compile", () => {
    const previous = succeeded();
    const edited = files("b");

    const failed = compileReducer(
      compileReducer(
        { ...previous, phase: "compiling" },
        { type: "start", projectId: "p1", runId: 2, at: 3 },
      ),
      {
        type: "failure",
        projectId: "p1",
        runId: 2,
        kind: "latex",
        message: "boom",
        at: 4,
      },
    );

    expect(failed.pdf).toBe(pdf);
    expect(isFresh(failed, inputs(edited))).toBe(false);
  });

  it("marks the PDF stale as soon as the files change", () => {
    const state = succeeded();
    expect(isFresh(state, inputs(files("changed")))).toBe(false);
  });

  it("ignores a result from a previous run", () => {
    const started = compileReducer(initialCompileState(), {
      type: "start",
      projectId: "p1",
      runId: 5,
      at: 1,
    });

    const stale = compileReducer(started, {
      type: "success",
      projectId: "p1",
      runId: 4,
      pdf,
      inputs: inputs(files()),
      at: 2,
    });

    expect(stale).toBe(started);
  });

  it("ignores a result from a previous project", () => {
    const started = compileReducer(initialCompileState(), {
      type: "start",
      projectId: "p2",
      runId: 1,
      at: 1,
    });

    const stale = compileReducer(started, {
      type: "success",
      projectId: "p1",
      runId: 1,
      pdf,
      inputs: inputs(files()),
      at: 2,
    });

    expect(stale).toBe(started);
  });

  it("keeps the PDF on cancel", () => {
    const previous = succeeded();
    const cancelled = compileReducer(
      compileReducer(previous, {
        type: "start",
        projectId: "p1",
        runId: 2,
        at: 3,
      }),
      { type: "cancel", projectId: "p1", runId: 2, at: 4 },
    );

    expect(cancelled.phase).toBe("cancelled");
    expect(cancelled.pdf).toBe(pdf);
  });

  it("resets to the initial state", () => {
    const reset = compileReducer(succeeded(), { type: "reset" });
    expect(reset).toEqual(initialCompileState());
  });
});
