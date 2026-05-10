"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeftRight, Heart, Loader2, Plus, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export default function TranslatorChat() {
  const [direction, setDirection] = useState<Direction>("satoori-to-seoul");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;
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

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, direction, history }),
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
          prev.map((m) => (m.id === id && m.role === "assistant" ? { ...m, streaming: false } : m)),
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
        prev.map((m) => {
          if (m.id !== id || m.role !== "assistant") return m;
          return { ...m, visible: { ...m.visible, [key]: partial } };
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
    send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  function toggleDirection() {
    setDirection((d) => (d === "satoori-to-seoul" ? "seoul-to-satoori" : "satoori-to-seoul"));
  }

  async function handleNewChat() {
    if (loading || resetting) return;

    setResetting(true);

    try {
      const res = await fetch("/api/chat/new", {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("새 채팅을 시작하지 못했습니다.");
      }

      setMessages([]);
      setInput("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "새 채팅을 시작하지 못했습니다.";
      setMessages((prev) => [...prev, { id: uid(), role: "assistant-error", message }]);
    } finally {
      setResetting(false);
    }
  }

  const labels = DIRECTION_LABEL[direction];
  const isEmpty = messages.length === 0;

  const composer = (
    <form onSubmit={handleSubmit} className="bg-white">
      <div className="mx-auto max-w-2xl px-4 py-3">
        <div className="flex items-center gap-2 rounded-full border border-border bg-white py-1.5 pl-5 pr-1.5 shadow-sm">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={labels.placeholder}
            rows={1}
            className="max-h-40 flex-1 resize-none border-0 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" disabled={loading || !input.trim()} className="h-9 w-9 shrink-0 rounded-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {isEmpty && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {labels.samples.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-full border border-primary/30 bg-white px-3.5 py-1.5 text-xs text-primary shadow-sm transition hover:bg-primary/5"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </form>
  );

  const disclaimer = (
    <p className="bg-white px-4 pb-3 text-center text-xs text-muted-foreground">
      경상어 번역기는 실수를 할 수 있습니다. 중요한 정보는 재차 확인하세요.
    </p>
  );

  return (
    <div className="flex h-dvh flex-col bg-white">
      <header className="bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="경상어 번역기 로고"
              width={32}
              height={32}
              priority
              className="h-8 w-8 object-contain"
            />
            <div className="leading-tight">
              <h1 className="text-sm font-semibold">경상어 번역기</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNewChat}
              disabled={loading || resetting}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="새 채팅 시작"
            >
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              <span>새 채팅</span>
            </button>
            {isEmpty && (
              <button
                type="button"
                onClick={toggleDirection}
                className="group flex items-center gap-2 rounded-full border border-gray/30 px-3 py-1.5 text-xs font-medium text-gray-800 transition"
                aria-label="번역 방향 전환"
              >
                <span>{labels.from}</span>
                <ArrowLeftRight className="h-3.5 w-3.5 transition group-hover:rotate-180" />
                <span>{labels.to}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-2xl">
            <EmptyState direction={direction} />
            {composer}
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
              {messages.map((m) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="user-message-bubble-color corner-superellipse/0.98 relative min-w-0 max-w-[70%] overflow-hidden whitespace-pre-wrap rounded-[22px] bg-primary px-4 py-2.5 text-sm leading-6 text-primary-foreground shadow-sm">
                        {m.text}
                      </div>
                    </div>
                  );
                }
                if (m.role === "assistant-error") {
                  return (
                    <div key={m.id} className="flex justify-start">
                      <div className="max-w-[85%] rounded-[22px] border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
                        번역에 실패했어요: {m.message}
                      </div>
                    </div>
                  );
                }
                return (
                  <AssistantBubble
                    key={m.id}
                    visible={m.visible}
                    streaming={m.streaming}
                    direction={m.direction}
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
      {disclaimer}
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
    <div className="flex justify-start">
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
                <span className="font-medium text-primary">이렇게 답해보세요</span> — {visible.tip}
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
      ? "아부지가 무뚝뚝하게 던진 한마디, 진짜 의미가 궁금하다면."
      : "표현이 서툴러 못 했던 말, 경상도식으로 자연스럽게 바꿔드려요.";

  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{intro}</p>
    </div>
  );
}
