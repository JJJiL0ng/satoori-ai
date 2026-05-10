"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowLeftRight,
  Heart,
  Loader2,
  PanelLeft,
  Send,
  Sparkles,
  SquarePen,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ChatThreadDetailResponse,
  ChatThreadSummary,
  ChatThreadsResponse,
  StoredChatMessage,
} from "@/lib/chat-api-types";
import { AssistantPayload, ChatHistoryMessage, Direction } from "@/lib/chat-types";

type Message =
  | {
      id: string;
      role: "user";
      direction: Direction;
      text: string;
    }
  | {
      id: string;
      role: "assistant";
      direction: Direction;
      payload: AssistantPayload;
      visible: AssistantPayload;
      streaming: boolean;
    }
  | {
      id: string;
      role: "assistant-error";
      message: string;
    };

const DIRECTION_LABEL: Record<Direction, { from: string; to: string; placeholder: string; samples: string[] }> = {
  "satoori-to-seoul": {
    from: "경상도",
    to: "서울말 + 본심",
    placeholder: "마 뭐하노",
    samples: ["밥은 묵었나", "마, 됐다", "쓸데없는 소리 하지 마라", "차 조심해서 댕기라"],
  },
  "seoul-to-satoori": {
    from: "하고 싶은 말",
    to: "경상도식 한마디",
    placeholder: "보고 싶다고 말하고 싶은데 어색해",
    samples: [
      "엄마한테 고맙다고 말하고 싶어",
      "아빠한테 사랑한다고 전하고 싶은데 어색해",
      "동생한테 미안하다고 말하고 싶어",
    ],
  },
};

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function emptyAssistantPayload(responseType?: AssistantPayload["responseType"]): AssistantPayload {
  return { responseType, translated: "" };
}

function serializeHistory(messages: Message[]): ChatHistoryMessage[] {
  return messages.reduce<ChatHistoryMessage[]>((history, message) => {
    if (message.role === "user") {
      history.push({ role: "user", direction: message.direction, text: message.text });
      return history;
    }

    if (message.role === "assistant") {
      history.push({ role: "assistant", direction: message.direction, payload: message.payload });
      return history;
    }

    return history;
  }, []);
}

function storedToUiMessage(message: StoredChatMessage): Message {
  if (message.role === "user") {
    return {
      id: message.id,
      role: "user",
      direction: message.direction,
      text: message.text,
    };
  }

  if (message.role === "assistant") {
    return {
      id: message.id,
      role: "assistant",
      direction: message.direction,
      payload: message.payload,
      visible: message.payload,
      streaming: false,
    };
  }

  return {
    id: message.id,
    role: "assistant-error",
    message: message.message,
  };
}

function buildOptimisticTitle(text: string): string {
  const normalized = text.trim();
  if (!normalized) return "새 채팅";
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

function inferDirectionFromMessages(messages: Message[], fallback: Direction): Direction {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" || message.role === "assistant") {
      return message.direction;
    }
  }

  return fallback;
}

export default function TranslatorChat() {
  const [direction, setDirection] = useState<Direction>("satoori-to-seoul");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [activeThreadToken, setActiveThreadToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, historyLoading]);

  useEffect(() => {
    void initializeChat();
  }, []);

  async function initializeChat() {
    setThreadsLoading(true);

    try {
      const threadState = await fetchThreads();
      if (threadState.activeThreadToken) {
        await loadThread(threadState.activeThreadToken);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "채팅 목록을 불러오지 못했습니다.";
      setMessages([{ id: uid(), role: "assistant-error", message }]);
    } finally {
      setThreadsLoading(false);
    }
  }

  async function fetchThreads(preferredThreadToken?: string | null) {
    const res = await fetch("/api/chat/threads", {
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error("채팅 목록을 불러오지 못했습니다.");
    }

    const data = (await res.json()) as ChatThreadsResponse;
    const resolvedActiveThreadToken =
      preferredThreadToken ?? data.activeThreadToken ?? data.threads[0]?.threadToken ?? null;

    setThreads(data.threads);
    setActiveThreadToken(resolvedActiveThreadToken);

    return {
      threads: data.threads,
      activeThreadToken: resolvedActiveThreadToken,
    };
  }

  async function loadThread(threadToken: string) {
    setHistoryLoading(true);

    try {
      const res = await fetch(`/api/chat/threads/${threadToken}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error("채팅 내용을 불러오지 못했습니다.");
      }

      const data = (await res.json()) as ChatThreadDetailResponse;
      const nextMessages = data.messages.map(storedToUiMessage);

      setMessages(nextMessages);
      setActiveThreadToken(data.threadToken);
      setDirection((current) => inferDirectionFromMessages(nextMessages, current));
    } catch (err) {
      const message = err instanceof Error ? err.message : "채팅 내용을 불러오지 못했습니다.";
      setMessages([{ id: uid(), role: "assistant-error", message }]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshThreads(preferredThreadToken?: string | null) {
    try {
      return await fetchThreads(preferredThreadToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "채팅 목록을 불러오지 못했습니다.";
      setMessages((prev) => [...prev, { id: uid(), role: "assistant-error", message }]);
      return null;
    }
  }

  async function send(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || loading || historyLoading) return;
    const history = serializeHistory(messages);

    const userMsg: Message = {
      id: uid(),
      role: "user",
      direction,
      text: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    setThreads((prev) => {
      const now = new Date().toISOString();
      if (activeThreadToken) {
        const existing = prev.find((t) => t.threadToken === activeThreadToken);
        const updated: ChatThreadSummary = existing
          ? {
              ...existing,
              title: existing.title && existing.title !== "새 채팅" ? existing.title : buildOptimisticTitle(trimmed),
              preview: trimmed,
              updatedAt: now,
            }
          : {
              threadToken: activeThreadToken,
              title: buildOptimisticTitle(trimmed),
              preview: trimmed,
              createdAt: now,
              updatedAt: now,
            };
        return [updated, ...prev.filter((t) => t.threadToken !== activeThreadToken)];
      }
      const optimistic: ChatThreadSummary = {
        threadToken: "__optimistic__",
        title: buildOptimisticTitle(trimmed),
        preview: trimmed,
        createdAt: now,
        updatedAt: now,
      };
      return [optimistic, ...prev.filter((t) => t.threadToken !== "__optimistic__")];
    });

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, direction, history, threadToken: activeThreadToken ?? undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant-error", message: data?.error ?? "번역에 실패했습니다." },
        ]);
        return;
      }

      const payload = data as AssistantPayload;
      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          direction,
          payload,
          visible: emptyAssistantPayload(payload.responseType),
          streaming: true,
        },
      ]);

      const threadState = await refreshThreads(activeThreadToken);
      if (!activeThreadToken && threadState?.activeThreadToken) {
        setActiveThreadToken(threadState.activeThreadToken);
      }

      setLoading(false);
      streamAssistant(assistantId, payload);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : "네트워크 오류";
      setMessages((prev) => [...prev, { id: uid(), role: "assistant-error", message }]);
    }

    setLoading(false);
  }

  function streamAssistant(id: string, full: AssistantPayload) {
    const fields: (keyof AssistantPayload)[] = ["translated", "emotion", "realMeaning", "tip"];
    let fieldIdx = 0;
    let charIdx = 0;

    const tick = () => {
      if (fieldIdx >= fields.length) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === id && message.role === "assistant" ? { ...message, streaming: false } : message,
          ),
        );
        return;
      }

      const key = fields[fieldIdx];
      const rawValue = full[key];
      const fullText = typeof rawValue === "string" ? rawValue : "";

      if (fullText.length === 0) {
        fieldIdx += 1;
        charIdx = 0;
        window.setTimeout(tick, 0);
        return;
      }

      const isInstantField = key === "emotion";
      const step = isInstantField ? fullText.length : Math.max(1, Math.ceil(fullText.length / 40));
      charIdx = Math.min(fullText.length, charIdx + step);
      const partial = fullText.slice(0, charIdx);

      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== id || message.role !== "assistant") return message;
          return { ...message, visible: { ...message.visible, [key]: partial } };
        }),
      );

      if (charIdx >= fullText.length) {
        fieldIdx += 1;
        charIdx = 0;
      }

      const delay = isInstantField ? 80 : 30 + Math.random() * 25;
      window.setTimeout(tick, delay);
    };

    window.setTimeout(tick, 50);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  }

  function toggleDirection() {
    setDirection((current) => (current === "satoori-to-seoul" ? "seoul-to-satoori" : "satoori-to-seoul"));
  }

  async function handleNewChat() {
    if (loading || resetting) return;
    if (messages.length === 0) return;

    setResetting(true);

    try {
      const res = await fetch("/api/chat/new", {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("새 채팅을 시작하지 못했습니다.");
      }

      const data = (await res.json()) as { threadToken?: string };
      const nextThreadToken = data.threadToken ?? null;

      setMessages([]);
      setInput("");
      setActiveThreadToken(nextThreadToken);
      await refreshThreads(nextThreadToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "새 채팅을 시작하지 못했습니다.";
      setMessages((prev) => [...prev, { id: uid(), role: "assistant-error", message }]);
    } finally {
      setResetting(false);
    }
  }

  async function handleThreadSelect(threadToken: string) {
    if (threadToken === activeThreadToken || loading || historyLoading) return;
    await loadThread(threadToken);
  }

  const labels = DIRECTION_LABEL[direction];
  const isEmpty = messages.length === 0;

  const composer = (
    <form onSubmit={handleSubmit} className="bg-white">
      <div className="mx-auto max-w-3xl px-4 py-3">
        <div className="flex items-center gap-2 rounded-full border border-border bg-white py-1.5 pl-5 pr-1.5 shadow-sm">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={labels.placeholder}
            rows={1}
            className="max-h-40 flex-1 resize-none border-0 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button
            type="submit"
            size="icon"
            disabled={loading || historyLoading || !input.trim()}
            className="h-9 w-9 shrink-0 rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {isEmpty && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {labels.samples.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => void send(sample)}
                className="rounded-full border border-primary/20 bg-white px-3.5 py-1.5 text-xs text-primary shadow-sm transition hover:bg-primary/5"
              >
                {sample}
              </button>
            ))}
          </div>
        )}
      </div>
    </form>
  );

  return (
    <div className="flex h-dvh bg-[#fbfbf8] text-foreground">
      <aside
        className={`${
          sidebarOpen ? "flex" : "hidden"
        } w-full shrink-0 flex-col border-r border-border bg-white md:flex md:w-[260px]`}
      >
        <div className="flex items-center justify-between px-3 pb-2 pt-3">
          <div className="flex min-w-0 items-center gap-2 px-2">
            <Image src="/logo.png" alt="경상어 번역기 로고" width={22} height={22} className="h-[22px] w-[22px] object-contain" />
            <h1 className="truncate text-[15px] font-semibold text-foreground">경상어 번역기</h1>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted"
            onClick={() => setSidebarOpen(false)}
            aria-label="사이드바 접기"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="px-2">
          <button
            type="button"
            onClick={() => void handleNewChat()}
            disabled={loading || resetting}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resetting ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <SquarePen className="h-4 w-4 text-muted-foreground" />
            )}
            <span>새 채팅</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-4">
          <div className="mb-2 px-2 text-xs font-semibold text-muted-foreground">최근</div>
          <div className="flex flex-col">
            {threadsLoading ? (
              <SidebarLoading />
            ) : threads.length === 0 ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">아직 저장된 채팅이 없습니다.</div>
            ) : (
              threads.map((thread) => {
                const isOptimistic = thread.threadToken === "__optimistic__";
                const isActive =
                  thread.threadToken === activeThreadToken || (isOptimistic && activeThreadToken === null);

                return (
                  <button
                    key={thread.threadToken}
                    type="button"
                    onClick={() => {
                      if (isOptimistic) return;
                      void handleThreadSelect(thread.threadToken);
                    }}
                    className={`w-full animate-message-in truncate rounded-lg px-2 py-2 text-left text-sm transition ${
                      isActive ? "bg-muted text-foreground" : "text-foreground/90 hover:bg-muted"
                    }`}
                  >
                    {thread.title}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="border-t border-border/60 px-2 py-2">
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-muted"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white">
              <User className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">JJJiL0ng</span>
              <span className="block truncate text-xs text-muted-foreground">premium</span>
            </span>
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="border-b border-border/60 bg-white">
          <div className="flex w-full items-center justify-between gap-3 px-3 py-4">
            <div className="flex min-w-0 items-center gap-3">
              {!sidebarOpen && (
                <button
                  type="button"
                  className="rounded-full border border-border p-2 text-muted-foreground transition hover:bg-muted"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="사이드바 열기"
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={toggleDirection}
              disabled={!isEmpty}
              className="group flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-gray-800 transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
              aria-label="번역 방향 전환"
              title={isEmpty ? "번역 방향 전환" : "대화가 시작되면 방향을 바꿀 수 없어요"}
            >
              <span>{labels.from}</span>
              <ArrowLeftRight className="h-3.5 w-3.5 transition group-hover:rotate-180 group-disabled:group-hover:rotate-0" />
              <span>{labels.to}</span>
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          {historyLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>저장된 채팅을 불러오는 중입니다.</span>
              </div>
            </div>
          ) : isEmpty ? (
            <div className="flex flex-1 items-center justify-center px-4">
              <div className="w-full max-w-3xl animate-fade-in-up">
                <EmptyState direction={direction} />
                {composer}
              </div>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto">
                <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
                  {messages.map((message) => {
                    if (message.role === "user") {
                      return (
                        <div key={message.id} className="flex animate-message-in justify-end">
                          <div className="relative min-w-0 max-w-[75%] overflow-hidden whitespace-pre-wrap rounded-[22px] bg-primary px-4 py-2.5 text-sm leading-6 text-primary-foreground shadow-sm">
                            {message.text}
                          </div>
                        </div>
                      );
                    }

                    if (message.role === "assistant-error") {
                      return (
                        <div key={message.id} className="flex animate-message-in justify-start">
                          <div className="max-w-[85%] rounded-[22px] border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
                            번역에 실패했어요: {message.message}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <AssistantBubble
                        key={message.id}
                        visible={message.visible}
                        streaming={message.streaming}
                        direction={message.direction}
                      />
                    );
                  })}

                  {loading && (
                    <div className="flex justify-start pl-2">
                      <span className="typing-dot h-2 w-2 rounded-full bg-primary" />
                    </div>
                  )}
                </div>
              </div>
              {composer}
            </>
          )}

          <p className="bg-white px-4 pb-3 text-center text-xs text-muted-foreground">
            경상어 번역기는 실수를 할 수 있습니다. 중요한 정보는 재차 확인하세요.
          </p>
        </div>
      </main>
    </div>
  );
}

function AssistantBubble({
  visible,
  streaming,
  direction,
}: {
  visible: AssistantPayload;
  streaming: boolean;
  direction: Direction;
}) {
  const title =
    visible.responseType === "reply"
      ? "답변"
      : visible.responseType === "explanation"
        ? "맥락 설명"
        : direction === "satoori-to-seoul"
          ? "서울말 번역"
          : "경상도식 번역";
  const hasEmotion = Boolean(visible.emotion);
  const hasMeaning = Boolean(visible.realMeaning);
  const hasTip = Boolean(visible.tip);
  const showMeaningSection = hasEmotion || hasMeaning || hasTip;

  const Caret = () => (
    <span className="ml-0.5 inline-block h-4 w-[2px] -translate-y-[1px] animate-pulse bg-primary align-middle" />
  );

  return (
    <div className="flex animate-message-in justify-start">
      <div className="w-full max-w-[92%] space-y-2">
        <div className="rounded-[22px] border border-border bg-white px-4 py-3 shadow-sm">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
            <Sparkles className="h-3 w-3" />
            <span>{title}</span>
          </div>
          <p className="whitespace-pre-wrap text-base font-medium leading-relaxed text-foreground">
            {visible.translated}
            {streaming && visible.translated.length > 0 && !visible.realMeaning && !visible.tip && <Caret />}
          </p>
        </div>

        {showMeaningSection && (
          <div className="rounded-[22px] border bg-secondary px-4 py-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
              <Heart className="h-3 w-3" fill="currentColor" />
              <span>속마음 해설</span>
              {hasEmotion && (
                <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {visible.emotion}
                </span>
              )}
            </div>
            {hasMeaning && (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {visible.realMeaning}
                {streaming && Boolean(visible.realMeaning) && !visible.tip && <Caret />}
              </p>
            )}
            {hasTip && (
              <div className="mt-2 border-t border-primary/15 pt-2 text-xs text-muted-foreground">
                <span className="font-medium text-primary">이렇게 받아들여보세요</span> - {visible.tip}
                {streaming && <Caret />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ direction }: { direction: Direction }) {
  const title =
    direction === "satoori-to-seoul"
      ? "어떤 사투리가 궁금하세요?"
      : "어떤 말을 사투리로 바꿔드릴까요?";
  const intro =
    direction === "satoori-to-seoul"
      ? "무뚝뚝하게 던진 한마디도, 대화 맥락까지 이어서 읽어드립니다."
      : "표현이 서툴러 못 했던 말도, 경상도식으로 자연스럽게 이어드립니다.";

  return (
    <div className="mb-8 flex flex-col items-center text-center">
      <h2 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{intro}</p>
    </div>
  );
}

function SidebarLoading() {
  const widths = ["w-3/4", "w-2/3", "w-4/5", "w-1/2", "w-3/5"];
  return (
    <>
      {widths.map((w, index) => (
        <div key={index} className="px-2 py-2">
          <div className={`h-3.5 ${w} rounded bg-muted`} />
        </div>
      ))}
    </>
  );
}
