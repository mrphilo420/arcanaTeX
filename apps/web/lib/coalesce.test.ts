import { describe, expect, it } from "vitest";
import { createCoalescedRunner } from "@/lib/coalesce";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createCoalescedRunner", () => {
  it("runs immediately when idle", async () => {
    let runs = 0;
    const trigger = createCoalescedRunner(async () => {
      runs++;
    });

    await trigger();
    expect(runs).toBe(1);
  });

  it("never runs two at once", async () => {
    let active = 0;
    let maxActive = 0;
    const gates = [deferred(), deferred()];
    let call = 0;
    const trigger = createCoalescedRunner(async () => {
      const gate = gates[call++];
      active++;
      maxActive = Math.max(maxActive, active);
      await gate.promise;
      active--;
    });

    const first = trigger();
    const second = trigger();
    gates[0].resolve();
    await Promise.resolve();
    gates[1].resolve();
    await Promise.all([first, second]);

    expect(maxActive).toBe(1);
  });

  it("collapses many triggers during a run into one follow-up", async () => {
    let runs = 0;
    const gate = deferred();
    const trigger = createCoalescedRunner(async () => {
      runs++;
      if (runs === 1) await gate.promise;
    });

    const all = [trigger(), trigger(), trigger(), trigger()];
    gate.resolve();
    await Promise.all(all);

    expect(runs).toBe(2);
  });

  it("resolves a queued trigger only after the follow-up has run", async () => {
    const order: string[] = [];
    const gate = deferred();
    let runs = 0;
    const trigger = createCoalescedRunner(async () => {
      const n = ++runs;
      if (n === 1) await gate.promise;
      order.push(`run${n}`);
    });

    const first = trigger();
    const queued = trigger().then(() => order.push("queued-done"));
    gate.resolve();
    await Promise.all([first, queued]);

    expect(order).toEqual(["run1", "run2", "queued-done"]);
  });

  it("keeps working after a run throws", async () => {
    let runs = 0;
    const trigger = createCoalescedRunner(async () => {
      if (++runs === 1) throw new Error("boom");
    });

    await expect(trigger()).rejects.toThrow("boom");
    await trigger();
    expect(runs).toBe(2);
  });
});
