import type { UIMessage } from "ai";
import { getDB } from "@/lib/storage/db";
import type { StoredChatHistory } from "@/lib/storage/schema";

export type ChatHistoryLoadResult =
  | { status: "ok"; messages: UIMessage[] }
  | { status: "missing" }
  | { status: "unreadable"; reason: string };

export async function loadChatHistory(
  projectId: string,
): Promise<ChatHistoryLoadResult> {
  let stored: StoredChatHistory | undefined;
  try {
    const db = await getDB();
    stored = await db.get("projectChats", projectId);
  } catch (error) {
    return {
      status: "unreadable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  if (!stored) {
    return { status: "missing" };
  }

  if (!Array.isArray(stored.messages)) {
    return {
      status: "unreadable",
      reason: "Stored chat history does not contain a valid messages array",
    };
  }

  return {
    status: "ok",
    messages: stored.messages as UIMessage[],
  };
}

export async function loadChatMessages(
  projectId: string,
): Promise<UIMessage[] | null> {
  const result = await loadChatHistory(projectId);
  return result.status === "ok" ? result.messages : null;
}

export async function saveChatMessages(
  projectId: string,
  messages: UIMessage[],
  confirmedLoad = true,
): Promise<void> {
  if (!confirmedLoad) return;

  const db = await getDB();

  if (messages.length === 0) {
    await db.delete("projectChats", projectId);
    return;
  }

  await db.put("projectChats", {
    projectId,
    updatedAt: Date.now(),
    messages,
    version: 1,
  });
}

export async function deleteChatHistory(projectId: string): Promise<void> {
  const db = await getDB();
  await db.delete("projectChats", projectId);
}
