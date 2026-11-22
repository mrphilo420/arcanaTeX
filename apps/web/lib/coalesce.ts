/**
 * Wraps an async task so at most one run is in flight. Triggers that arrive
 * during a run collapse into a single follow-up run; every such caller waits
 * for that follow-up, so it always sees the latest state.
 */
export function createCoalescedRunner(
  run: () => Promise<void>,
): () => Promise<void> {
  let current: Promise<void> | null = null;
  let queued: Promise<void> | null = null;

  const start = (): Promise<void> => {
    const task = run().finally(() => {
      current = null;
    });
    current = task;
    return task;
  };

  return () => {
    if (!current) return start();
    if (!queued) {
      queued = current
        .catch(() => {})
        .then(() => {
          queued = null;
          return start();
        });
    }
    return queued;
  };
}
