"use client";

import { useEffect, useRef } from "react";
import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useThreadRuntime,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  LoaderIcon,
  MessageCircleIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import type { FC } from "react";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { ChatCodeBlock } from "@/components/assistant-ui/code-block";
import { ChatQuickActions } from "@/components/assistant-ui/chat-quick-actions";
import { ClearChatButton } from "@/components/assistant-ui/clear-chat-button";
import { MergeChangesCard } from "@/components/assistant-ui/merge-changes-card";
import { ModelPicker } from "@/components/assistant-ui/model-picker";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";
import { useDocumentStore } from "@/stores/document-store";
import { useDocumentContext } from "@/hooks/use-document-context";

export function AIDrawer() {
  useDocumentContext();
  const threadRuntime = useThreadRuntime();
  const isOpen = useDocumentStore((s) => s.isThreadOpen);
  const setIsOpen = useDocumentStore((s) => s.setThreadOpen);
  const threadInitializedRef = useRef(false);
  const lastMessageCountRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      threadInitializedRef.current = true;
      lastMessageCountRef.current = threadRuntime.getState().messages.length;
    }, 2_500);
    return () => clearTimeout(timer);
  }, [threadRuntime]);

  useEffect(() => {
    return threadRuntime.subscribe(() => {
      const state = threadRuntime.getState();
      if (state.isRunning) {
        lastMessageCountRef.current = state.messages.length;
        setIsOpen(true);
        return;
      }
      if (!threadInitializedRef.current) {
        lastMessageCountRef.current = state.messages.length;
        return;
      }
      if (state.messages.length > lastMessageCountRef.current) {
        lastMessageCountRef.current = state.messages.length;
        setIsOpen(true);
      } else {
        lastMessageCountRef.current = state.messages.length;
      }
    });
  }, [threadRuntime, setIsOpen]);

  if (isOpen) return null;

  return (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="pointer-events-auto absolute right-4 bottom-6 z-20 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_12px_32px_rgba(204,120,92,0.35)] transition-all duration-300 ease-out hover:scale-105 hover:bg-[#b96a50] hover:shadow-xl"
      aria-label="Open assistant"
    >
      <MessageCircleIcon className="size-5" />
    </button>
  );
}

/**
 * Dockable chat body. The resize handle and collapse/expand behavior belong to
 * the surrounding PanelGroup; this component only owns the thread and composer.
 */
export function ChatPanel() {
  const setOpen = useDocumentStore((s) => s.setThreadOpen);

  return (
    <div className="flex h-full min-h-0 flex-col border-hairline border-t bg-popover">
      <div className="flex h-9 shrink-0 items-center justify-between border-hairline border-b px-3">
        <div className="flex items-center gap-1.5 font-medium text-xs">
          <MessageCircleIcon className="size-3.5 text-primary" />
          Assistant
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[0.6875rem] text-muted-foreground sm:inline">
            Drag the divider to resize
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Collapse chat"
            title="Collapse chat"
          >
            <ChevronDownIcon className="size-4" />
          </button>
        </div>
      </div>
      <ThreadPrimitive.Root className="aui-root flex min-h-0 flex-1 flex-col overflow-hidden bg-popover text-foreground">
        <ThreadMessages />
        <Composer />
      </ThreadPrimitive.Root>
    </div>
  );
}

const ThreadMessages: FC = () => {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <ThreadPrimitive.Viewport
        turnAnchor="bottom"
        className="aui-thread-viewport absolute inset-0 overflow-y-auto scroll-smooth px-4"
      >
        <div className="mx-auto w-full max-w-3xl">
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />
          <ThreadLoading />
        </div>
      </ThreadPrimitive.Viewport>

      <ThreadScrollToBottom />
    </div>
  );
};

const ThreadLoading: FC = () => {
  return (
    <AuiIf condition={({ thread }) => thread.isRunning}>
      <div className="flex items-center gap-1.5 px-1 py-1.5 text-muted-foreground">
        <LoaderIcon className="size-3.5 animate-spin" />
        <span className="text-sm">Thinking...</span>
      </div>
    </AuiIf>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="absolute right-4 bottom-2 z-10 rounded-full p-2 disabled:invisible dark:bg-background dark:hover:bg-accent"
      >
        <ArrowDownIcon className="size-4" />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const Composer: FC = () => {
  return (
    <ComposerPrimitive.Root className="shrink-0 p-3">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <ChatQuickActions />
          <div className="flex shrink-0 items-center gap-1">
            <ModelPicker className="h-6 w-[190px] shrink-0 bg-transparent" />
            <ClearChatButton className="size-6" />
          </div>
        </div>
        <div className="flex w-full flex-col rounded-xl border border-input bg-muted/30 transition-colors focus-within:border-ring focus-within:bg-background">
          <ComposerPrimitive.Input
            placeholder="Ask about LaTeX, /paper-review, /proofread, or Lean..."
            className="max-h-40 min-h-10 w-full resize-none bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Message input"
          />
          <div className="flex items-center justify-end px-2 pb-2">
            <ComposerAction />
          </div>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC = () => {
  return (
    <>
      <AuiIf condition={({ thread }) => !thread.isRunning}>
        <ComposerPrimitive.Send asChild>
          <TooltipIconButton
            tooltip="Send"
            side="top"
            type="submit"
            variant="default"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Send message"
          >
            <ArrowUpIcon className="size-4" />
          </TooltipIconButton>
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf condition={({ thread }) => thread.isRunning}>
        <ComposerPrimitive.Cancel asChild>
          <TooltipIconButton
            tooltip="Stop"
            side="top"
            variant="secondary"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Stop generating"
          >
            <SquareIcon className="size-3 fill-current" />
          </TooltipIconButton>
        </ComposerPrimitive.Cancel>
      </AuiIf>
    </>
  );
};

const AssistantMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="group relative w-full py-1.5"
      data-role="assistant"
    >
      <div className="px-1 text-foreground text-sm leading-relaxed">
        <MessagePrimitive.Parts
          components={{
            Text: MarkdownText,
          }}
        />
      </div>

      <AuiIf condition={({ thread }) => !thread.isRunning}>
        <MergeChangesCard />
      </AuiIf>

      <div className="ml-1 flex">
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const MarkdownText: FC = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        SyntaxHighlighter: ChatCodeBlock,
      }}
      className="aui-md prose prose-sm dark:prose-invert max-w-none"
    />
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      className="-ml-1 flex gap-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copy">
          <AuiIf condition={({ message }) => message.isCopied}>
            <CheckIcon />
          </AuiIf>
          <AuiIf condition={({ message }) => !message.isCopied}>
            <CopyIcon />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Regenerate">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      className="flex w-full flex-col items-end py-1.5"
      data-role="user"
    >
      <div className="max-w-[85%] rounded-xl bg-muted px-3 py-1.5 text-foreground text-sm">
        <MessagePrimitive.Parts />
      </div>
      <BranchPicker className="mr-1 justify-end" />
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<{ className?: string }> = ({ className }) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "mr-2 -ml-2 inline-flex items-center text-muted-foreground text-xs",
        className,
      )}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
