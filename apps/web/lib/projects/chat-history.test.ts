import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredChatHistory } from "@/lib/storage/schema";

const store = new Map<string, StoredChatHistory>();
let dbError: Error | null = null;

const mockDb = {
  get: vi.fn(async (_storeName: string, key: string) => {
    if (dbError) throw dbError;
    return store.get(key);
  }),
  put: vi.fn(async (_storeName: string, value: StoredChatHistory) => {
    if (dbError) throw dbError;
    store.set(value.projectId, value);
    return value.projectId;
  }),
  delete: vi.fn(async (_storeName: string, key: string) => {
    if (dbError) throw dbError;
    store.delete(key);
  }),
};

const getDBMock = vi.fn(async () => {
  if (dbError) throw dbError;
  return mockDb;
});

vi.mock("@/lib/storage/db", () => ({
  getDB: getDBMock,
}));

const {
  deleteChatHistory,
  loadChatHistory,
  loadChatMessages,
  saveChatMessages,
} = await import("@/lib/projects/chat-history");

const msg = (id: string, text: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});

describe("chat-history", () => {
  beforeEach(() => {
    store.clear();
    dbError = null;
    vi.clearAllMocks();
  });

  it("returns ok with messages when a valid record exists", async () => {
    const messages = [msg("m1", "Hello")];
    store.set("proj-1", {
      projectId: "proj-1",
      updatedAt: 100,
      messages,
      version: 1,
    });

    await expect(loadChatHistory("proj-1")).resolves.toEqual({
      status: "ok",
      messages,
    });
    await expect(loadChatMessages("proj-1")).resolves.toEqual(messages);
  });

  it("returns missing when no record exists for the project", async () => {
    await expect(loadChatHistory("missing-proj")).resolves.toEqual({
      status: "missing",
    });
    await expect(loadChatMessages("missing-proj")).resolves.toBeNull();
  });

  it("returns unreadable when stored.messages is not an array", async () => {
    store.set("corrupt-proj", {
      projectId: "corrupt-proj",
      updatedAt: 100,
      messages: "corrupted" as unknown as unknown[],
    });

    const result = await loadChatHistory("corrupt-proj");
    expect(result.status).toBe("unreadable");
    if (result.status === "unreadable") {
      expect(result.reason).toMatch(/messages array/i);
    }
    await expect(loadChatMessages("corrupt-proj")).resolves.toBeNull();
  });

  it("returns unreadable when reading from IndexedDB throws", async () => {
    dbError = new Error("IndexedDB quota exceeded");

    const result = await loadChatHistory("proj-err");
    expect(result).toEqual({
      status: "unreadable",
      reason: "IndexedDB quota exceeded",
    });
    await expect(loadChatMessages("proj-err")).resolves.toBeNull();
  });

  it("never writes or deletes an existing record when confirmedLoad is false", async () => {
    const existing = [msg("m1", "Keep me safe")];
    store.set("proj-1", {
      projectId: "proj-1",
      updatedAt: 100,
      messages: existing,
      version: 1,
    });

    await saveChatMessages("proj-1", [], false);
    await saveChatMessages("proj-1", [msg("m2", "Overwrite")], false);

    expect(mockDb.delete).not.toHaveBeenCalled();
    expect(mockDb.put).not.toHaveBeenCalled();
    expect(getDBMock).not.toHaveBeenCalled();
    expect(store.get("proj-1")?.messages).toEqual(existing);
  });

  it("writes version 1 when saving confirmed non-empty messages and deletes when confirmed empty", async () => {
    const messages = [msg("m1", "Saved message")];
    await saveChatMessages("proj-1", messages, true);

    expect(store.get("proj-1")).toMatchObject({
      projectId: "proj-1",
      messages,
      version: 1,
    });

    await saveChatMessages("proj-1", [], true);
    expect(store.has("proj-1")).toBe(false);

    await saveChatMessages("proj-2", messages);
    await deleteChatHistory("proj-2");
    expect(store.has("proj-2")).toBe(false);
  });
});
