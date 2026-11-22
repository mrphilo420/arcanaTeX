"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useChat } from "@ai-sdk/react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useAISDKRuntime,
} from "@assistant-ui/react-ai-sdk";
import {
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import {
  compactionTargetFor,
  describeCompactionEvent,
  parseChatErrorPayload,
  streamCompaction,
  type ChatErrorPayload,
} from "@/lib/ai/client-compaction";
import { loadChatHistory, saveChatMessages } from "@/lib/projects/chat-history";
import { prepareAgentTurn, recordAgentFileCreate } from "@/lib/ai/agent-edits";
import { getPaperAuditInvocation } from "@/lib/chat-skills/paper-audit";
import { markdownReviewToLatex } from "@/lib/markdown-review";
import { reviewFilePath } from "@/lib/paper-review-file";
import { useAgentChangesStore } from "@/stores/agent-changes-store";
import { useChatModelStore } from "@/stores/chat-model-store";
import { fileKindForFile } from "@/lib/file-kind";
import { useDocumentStore } from "@/stores/document-store";

interface ThreadExchange {
  userText: string;
  assistantText: string;
  /** Where the action came from; stored on both messages. */
  source?: string;
}

interface ChatActions {
  /** Drops the conversation from the runtime and from local storage. */
  clear: () => void;
  /** Records an AI action that ran outside the composer in the thread. */
  appendExchange: (exchange: ThreadExchange) => void;
}

const ChatActionsContext = createContext<ChatActions | null>(null);

export function useChatActions(): ChatActions {
  const actions = useContext(ChatActionsContext);
  if (!actions) {
    throw new Error("useChatActions must be used inside ChatRuntimeProvider");
  }
  return actions;
}

const SYNTHETIC_PREFIXES = ["chat-error-", "chat-compact-"];

function isSyntheticMessage(id: string): boolean {
  return SYNTHETIC_PREFIXES.some((prefix) => id.startsWith(prefix));
}

let exchangeCounter = 0;

function exchangeMessages(exchange: ThreadExchange): UIMessage[] {
  const stamp = `${Date.now()}-${exchangeCounter++}`;
  const metadata = { source: exchange.source ?? "toolbar" };
  return [
    {
      id: `chat-action-user-${stamp}`,
      role: "user",
      parts: [{ type: "text", text: exchange.userText }],
      metadata,
    },
    {
      id: `chat-action-assistant-${stamp}`,
      role: "assistant",
      parts: [{ type: "text", text: exchange.assistantText }],
      metadata,
    },
  ];
}

interface ChatMessageMetadata {
  compactedText?: string;
}

function compactedTextFor(
  message: UIMessage,
  map: Map<string, string>,
): string | undefined {
  const stored = message.metadata as ChatMessageMetadata | undefined;
  if (typeof stored?.compactedText === "string") return stored.compactedText;
  return map.get(message.id);
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

/** Pulls the complete LaTeX review out of the assistant's final message. */
function extractLatexReview(text: string): string | null {
  const fenced = /```(?:latex|tex)\s*\n([\s\S]*?)```/i.exec(text);
  const fencedBody = fenced?.[1]?.trim();
  if (fencedBody && /\\documentclass|\\begin\{document\}/.test(fencedBody)) {
    return fencedBody;
  }

  const start = text.indexOf("\\documentclass");
  const endMarker = "\\end{document}";
  const end = text.lastIndexOf(endMarker);
  if (start !== -1 && end > start) {
    return text.slice(start, end + endMarker.length).trim();
  }

  return null;
}

/**
 * Replaces the first text part and drops any other text parts. Non-text parts
 * (attachments) survive untouched.
 */
function compactedParts(message: UIMessage, text: string): UIMessage["parts"] {
  let used = false;
  const parts: UIMessage["parts"] = [];

  for (const part of message.parts) {
    if (part.type !== "text") {
      parts.push(part);
      continue;
    }
    if (used) continue;
    used = true;
    parts.push({ ...part, text });
  }

  return parts;
}

export function ChatRuntimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const projectId = useDocumentStore((state) => state.projectId);

  // Compacted text is sent instead of the original message, but the thread
  // keeps showing what the user typed. Only the model sees the compression.
  const compactedRef = useRef<Map<string, string>>(new Map());
  const attemptedCompactionRef = useRef<Set<string>>(new Set());
  const compactionAbortRef = useRef<AbortController | null>(null);
  const pendingExchangesRef = useRef<ThreadExchange[]>([]);
  const savedReviewsRef = useRef<Set<string>>(new Set());
  const retriedOutputLimitRef = useRef<Set<string>>(new Set());

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        body: () => {
          const state = useDocumentStore.getState();
          const activeFile = state.files.find(
            (file) => file.id === state.activeFileId,
          );
          return {
            model: useChatModelStore.getState().selectedModelId,
            activeFileKind: activeFile
              ? fileKindForFile(activeFile)
              : undefined,
          };
        },
        prepareSendMessagesRequest: (options) => ({
          body: {
            ...options.body,
            id: options.id,
            messages: options.messages
              // Error and progress rows are presentation, not conversation.
              .filter((message) => !isSyntheticMessage(message.id))
              .map((message) => {
                const compacted = compactedTextFor(
                  message,
                  compactedRef.current,
                );
                if (compacted === undefined) return message;
                return {
                  ...message,
                  parts: compactedParts(message, compacted),
                };
              }),
            trigger: options.trigger,
            messageId: options.messageId,
            metadata: options.requestMetadata,
          },
        }),
      }),
    [],
  );

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
  const runtime = useAISDKRuntime(chat);
  const loadedProjectRef = useRef<string | null>(null);
  const loadConfirmedRef = useRef<boolean>(false);
  const loadRequestRef = useRef(0);
  const latestMessagesRef = useRef(chat.messages);
  const lastErrorRef = useRef<unknown>(null);

  latestMessagesRef.current = chat.messages;

  useEffect(() => {
    const messages = chat.messages;
    let lastUserId: string | null = null;
    let lastUserIndex = -1;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === "user") {
        lastUserId = messages[index].id;
        lastUserIndex = index;
        break;
      }
    }

    if (!lastUserId) return;

    const changes = useAgentChangesStore.getState();
    changes.beginTurn(lastUserId);

    // Every assistant message after the last user message belongs to this
    // turn, including the intermediate messages AI SDK creates between tools.
    for (let index = lastUserIndex + 1; index < messages.length; index += 1) {
      if (messages[index].role === "assistant") {
        changes.bindMessage(messages[index].id, lastUserId);
      }
    }
  }, [chat.messages]);

  const appendError = useCallback(
    (text: string) => {
      const errorMessage: UIMessage = {
        id: `chat-error-${Date.now()}`,
        role: "assistant",
        parts: [{ type: "text", text }],
      };
      chat.setMessages((previous) => [...previous, errorMessage]);
    },
    [chat],
  );

  /**
   * Oversized turn recovery: compact the message that failed, remember the
   * compacted text against its id, then resend. The transport substitutes the
   * summary only in the outgoing request, so the thread is unchanged.
   */
  const compactAndResend = useCallback(
    async (payload: ChatErrorPayload) => {
      const messages = latestMessagesRef.current;
      let lastUser: UIMessage | undefined;
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role === "user") {
          lastUser = messages[index];
          break;
        }
      }

      if (!lastUser) {
        appendError(payload.text);
        return;
      }

      const messageId = lastUser.id;

      // One attempt per user message. If the compacted text still does not
      // fit, another identical pass cannot help.
      if (attemptedCompactionRef.current.has(messageId)) {
        appendError(
          "The message is still too large after compaction. Switch to a provider with a higher per-minute limit, or split the message.",
        );
        return;
      }
      attemptedCompactionRef.current.add(messageId);

      const text = messageText(lastUser);
      const targetTokens = compactionTargetFor(payload, text);

      if (targetTokens === null) {
        appendError(
          "This model's system prompt and tool definitions use most of its per-minute token budget. The message cannot be compacted enough to fit. Use a provider with a higher limit.",
        );
        return;
      }

      const progressId = `chat-compact-${messageId}`;
      const setProgress = (progressText: string) => {
        chat.setMessages((previous) => {
          const next = previous.filter((message) => message.id !== progressId);
          next.push({
            id: progressId,
            role: "assistant",
            parts: [{ type: "text", text: progressText }],
          });
          return next;
        });
      };

      setProgress("Compressing this message before sending…");

      const controller = new AbortController();
      compactionAbortRef.current = controller;

      try {
        const result = await streamCompaction(
          {
            text,
            model: useChatModelStore.getState().selectedModelId,
            targetTokens,
          },
          (event) => setProgress(describeCompactionEvent(event)),
          controller.signal,
        );

        compactedRef.current.set(messageId, result.summary);
        // Metadata travels with the saved thread, so a reload does not have to
        // compact the same message again.
        chat.setMessages((previous) =>
          previous
            .filter((message) => message.id !== progressId)
            .map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    metadata: {
                      ...(typeof message.metadata === "object" &&
                      message.metadata !== null
                        ? message.metadata
                        : {}),
                      compactedText: result.summary,
                    },
                  }
                : message,
            ),
        );
        await chat.regenerate({ messageId });
      } catch (error) {
        if (controller.signal.aborted) return;
        chat.setMessages((previous) =>
          previous.filter((message) => message.id !== progressId),
        );
        appendError(
          error instanceof Error
            ? error.message.slice(0, 400)
            : "Compaction failed.",
        );
      } finally {
        if (compactionAbortRef.current === controller) {
          compactionAbortRef.current = null;
        }
      }
    },
    [appendError, chat],
  );

  useEffect(() => {
    if (!chat.error || chat.error === lastErrorRef.current) return;
    lastErrorRef.current = chat.error;

    const payload = parseChatErrorPayload(chat.error);

    if (payload.code === "context_budget_exceeded" && payload.limit) {
      void compactAndResend(payload);
      return;
    }

    // A provider that reports a lower output-token ceiling than we requested
    // has now taught the server its limit. Retry once with the capped budget.
    if (/output tokens per minute|\bOTPM\b/i.test(payload.text)) {
      let lastUser: UIMessage | undefined;
      for (
        let index = 0;
        index < latestMessagesRef.current.length;
        index += 1
      ) {
        const message = latestMessagesRef.current[index];
        if (message.role === "user" && !isSyntheticMessage(message.id)) {
          lastUser = message;
        }
      }
      if (lastUser && !retriedOutputLimitRef.current.has(lastUser.id)) {
        retriedOutputLimitRef.current.add(lastUser.id);
        window.setTimeout(() => {
          void chat.regenerate({ messageId: lastUser?.id });
        }, 600);
        return;
      }
    }

    // A failed turn must leave a visible assistant row. The row carries the
    // specific reason only: a generic "could not complete" line above it
    // repeats the same information, and a toast repeated it a third time.
    appendError(payload.text);
  }, [appendError, chat, chat.error, compactAndResend]);

  useEffect(() => {
    useChatModelStore.getState().hydrate();
  }, []);

  useEffect(() => {
    const timer = setInterval(
      () => {
        void useChatModelStore.getState().refreshOptions();
      },
      6 * 60 * 60 * 1000,
    );
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    transport.setRuntime(runtime);
  }, [transport, runtime]);

  useEffect(() => {
    if (chat.status !== "ready") return;
    const messages = chat.messages;

    let lastUser: UIMessage | undefined;
    let lastUserIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (
        messages[index].role === "user" &&
        !isSyntheticMessage(messages[index].id)
      ) {
        lastUser = messages[index];
        lastUserIndex = index;
        break;
      }
    }
    if (!lastUser || lastUserIndex === -1) return;
    if (!getPaperAuditInvocation(messageText(lastUser))) return;

    let assistant: UIMessage | undefined;
    for (let index = messages.length - 1; index > lastUserIndex; index -= 1) {
      if (
        messages[index].role === "assistant" &&
        !isSyntheticMessage(messages[index].id)
      ) {
        assistant = messages[index];
        break;
      }
    }
    if (!assistant || savedReviewsRef.current.has(assistant.id)) return;

    const assistantText = messageText(assistant);
    const reviewHeadings = [
      "overall",
      "technical",
      "finding",
      "editorial",
      "proofing",
    ].filter((heading) => assistantText.toLowerCase().includes(heading));
    const content =
      extractLatexReview(assistantText) ??
      (assistantText.trim().length > 300 && reviewHeadings.length >= 2
        ? markdownReviewToLatex(assistantText)
        : null);
    if (!content) return;

    savedReviewsRef.current.add(assistant.id);
    const turnId = lastUser.id;
    void (async () => {
      await prepareAgentTurn(turnId);
      const state = useDocumentStore.getState();
      if (!state.projectId) return;
      const path = reviewFilePath(state.files.map((file) => file.path));
      const name = path.split("/").pop() ?? "review.tex";
      const fileId = state.addFile({
        name,
        path,
        type: "tex",
        content,
      });
      recordAgentFileCreate({
        turnId,
        toolCallId: `paper-review-${assistant.id}`,
        fileId,
        filePath: path,
        content,
      });
    })().catch((error) => {
      console.error("Failed to save paper review", error);
    });
  }, [chat.messages, chat.status]);

  useEffect(() => {
    const previousProjectId = loadedProjectRef.current;

    if (previousProjectId === projectId) return;

    compactionAbortRef.current?.abort();
    compactionAbortRef.current = null;
    compactedRef.current.clear();
    attemptedCompactionRef.current.clear();
    pendingExchangesRef.current = [];
    retriedOutputLimitRef.current.clear();

    chat.stop();

    if (previousProjectId && loadConfirmedRef.current) {
      void saveChatMessages(
        previousProjectId,
        latestMessagesRef.current,
        loadConfirmedRef.current,
      );
    }
    loadConfirmedRef.current = false;

    const requestId = ++loadRequestRef.current;
    loadedProjectRef.current = null;

    if (!projectId) {
      chat.setMessages([]);
      loadedProjectRef.current = null;
      return;
    }

    void loadChatHistory(projectId)
      .then((result) => {
        if (loadRequestRef.current !== requestId) return;
        loadedProjectRef.current = projectId;
        if (result.status === "ok") {
          loadConfirmedRef.current = true;
          chat.setMessages(result.messages);
          return;
        }
        if (result.status === "missing") {
          loadConfirmedRef.current = true;
          chat.setMessages([]);
          return;
        }
        loadConfirmedRef.current = false;
        chat.setMessages([]);
        appendError(
          "Stored chat history could not be read. Autosave is paused for this thread so your saved conversation is not overwritten.",
        );
      })
      .catch((error) => {
        if (loadRequestRef.current !== requestId) return;
        console.error("Failed to load chat history", error);
        loadedProjectRef.current = projectId;
        loadConfirmedRef.current = false;
        chat.setMessages([]);
        appendError(
          "Stored chat history could not be read. Autosave is paused for this thread so your saved conversation is not overwritten.",
        );
      });
  }, [appendError, projectId, chat]);

  useEffect(() => {
    const currentProjectId = loadedProjectRef.current;
    if (!currentProjectId || !loadConfirmedRef.current) return;

    const timer = setTimeout(() => {
      if (!loadConfirmedRef.current) return;
      void saveChatMessages(
        currentProjectId,
        latestMessagesRef.current,
        loadConfirmedRef.current,
      );
    }, 600);

    return () => clearTimeout(timer);
  }, [projectId, chat.messages]);

  useEffect(() => {
    const flush = () => {
      const currentProjectId = loadedProjectRef.current;
      if (!currentProjectId || !loadConfirmedRef.current) return;
      void saveChatMessages(
        currentProjectId,
        latestMessagesRef.current,
        loadConfirmedRef.current,
      );
    };

    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  useEffect(() => {
    return () => {
      compactionAbortRef.current?.abort();
    };
  }, []);

  // `runtime.reset()` only clears assistant-ui's view. The messages live in
  // `useChat`, so clearing has to reset that state or the next request still
  // carries the old conversation.
  const actions = useMemo<ChatActions>(
    () => ({
      clear: () => {
        compactionAbortRef.current?.abort();
        compactionAbortRef.current = null;
        compactedRef.current.clear();
        attemptedCompactionRef.current.clear();
        pendingExchangesRef.current = [];
        retriedOutputLimitRef.current.clear();
        loadConfirmedRef.current = true;
        chat.stop();
        chat.setMessages([]);
        lastErrorRef.current = null;
      },
      appendExchange: (exchange) => {
        // A streaming answer owns the last message slot; queue the record and
        // flush it when the runtime is idle again.
        if (chat.status === "submitted" || chat.status === "streaming") {
          pendingExchangesRef.current.push(exchange);
          return;
        }
        chat.setMessages((previous) => [
          ...previous,
          ...exchangeMessages(exchange),
        ]);
      },
    }),
    [chat],
  );

  useEffect(() => {
    if (chat.status === "submitted" || chat.status === "streaming") return;
    if (pendingExchangesRef.current.length === 0) return;
    const pending = pendingExchangesRef.current.splice(0);
    chat.setMessages((previous) => [
      ...previous,
      ...pending.flatMap(exchangeMessages),
    ]);
  }, [chat, chat.status]);

  return (
    <ChatActionsContext.Provider value={actions}>
      <AssistantRuntimeProvider runtime={runtime}>
        {children}
      </AssistantRuntimeProvider>
    </ChatActionsContext.Provider>
  );
}
