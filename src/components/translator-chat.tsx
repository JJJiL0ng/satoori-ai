"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Heart, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type Direction = "satoori-to-seoul" | "seoul-to-satoori";

type AssistantPayload = {
  translated: string;
  realMeaning: string;
  emotion: string;
  tip: string;
};

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
    placeholder: "예: 밥은 묵었나",
    samples: ["밥은 묵었나", "마, 됐다", "쓸데없는 소리 하지 마라", "차 조심해서 댕기라"],
  },
  "seoul-to-satoori": {
    from: "하고 싶은 말",
    to: "경상도식 한마디",
    placeholder: "예: 보고 싶다고 말하고 싶은데 어색해",
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

export default function TranslatorChat() {
  const [direction, setDirection] = useState<Direction>("satoori-to-seoul");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(textToSend: string) {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

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
        body: JSON.stringify({ text: trimmed, direction }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant-error", message: data?.error ?? "번역에 실패했습니다." },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", direction, payload: data as AssistantPayload },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "네트워크 오류";
      setMessages((prev) => [...prev, { id: uid(), role: "assistant-error", message }]);
    } finally {
      setLoading(false);
    }
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

  const labels = DIRECTION_LABEL[direction];

  return (
    <div className="flex h-dvh flex-col bg-gradient-to-b from-orange-50/50 to-white">
      <header className="border-b border-border bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Heart className="h-4 w-4" fill="currentColor" />
            </div>
            <div className="leading-tight">
              <h1 className="text-sm font-semibold">속마음 번역기</h1>
              <p className="text-xs text-muted-foreground">경상도 ↔ 서울말, 그 사이의 진심</p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleDirection}
            className="group flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10"
            aria-label="번역 방향 전환"
          >
            <span>{labels.from}</span>
            <ArrowLeftRight className="h-3.5 w-3.5 transition group-hover:rotate-180" />
            <span>{labels.to}</span>
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
          {messages.length === 0 && <EmptyState samples={labels.samples} onPick={send} direction={direction} />}

          {messages.map((m) => {
            if (m.role === "user") {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">
                    {m.text}
                  </div>
                </div>
              );
            }
            if (m.role === "assistant-error") {
              return (
                <div key={m.id} className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
                    번역에 실패했어요: {m.message}
                  </div>
                </div>
              );
            }
            return <AssistantBubble key={m.id} payload={m.payload} direction={m.direction} />;
          })}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-white px-4 py-2.5 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>속마음을 들여다보는 중…</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-white p-2 shadow-sm focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={labels.placeholder}
              rows={1}
              className="max-h-40 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()} className="h-9 w-9 shrink-0 rounded-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Enter 전송 · Shift+Enter 줄바꿈 · 가정의 달, 가족에게 닿는 한마디
          </p>
        </div>
      </form>
    </div>
  );
}

function AssistantBubble({ payload, direction }: { payload: AssistantPayload; direction: Direction }) {
  const targetLabel = direction === "satoori-to-seoul" ? "서울말" : "경상도식";
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] space-y-2">
        <div className="rounded-2xl rounded-bl-sm border border-border bg-white px-4 py-3 shadow-sm">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
            <Sparkles className="h-3 w-3" />
            <span>{targetLabel} 번역</span>
          </div>
          <p className="whitespace-pre-wrap text-base font-medium leading-relaxed text-foreground">
            {payload.translated}
          </p>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-accent/60 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
            <Heart className="h-3 w-3" fill="currentColor" />
            <span>속마음 해설</span>
            <span className="ml-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
              {payload.emotion}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-accent-foreground">
            {payload.realMeaning}
          </p>
          <div className="mt-2 border-t border-primary/15 pt-2 text-xs text-muted-foreground">
            <span className="font-medium text-primary">💬 이렇게 답해보세요</span> — {payload.tip}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  samples,
  onPick,
  direction,
}: {
  samples: string[];
  onPick: (s: string) => void;
  direction: Direction;
}) {
  const intro =
    direction === "satoori-to-seoul"
      ? "아빠가 무뚝뚝하게 던진 한마디, 진짜 의미가 궁금하다면."
      : "표현이 서툴러 못 했던 말, 경상도식으로 자연스럽게 바꿔드려요.";

  return (
    <div className="my-12 flex flex-col items-center text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
        <Heart className="h-6 w-6" fill="currentColor" />
      </div>
      <h2 className="text-xl font-semibold text-foreground">속마음 번역기</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{intro}</p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {samples.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full border border-primary/30 bg-white px-3.5 py-1.5 text-xs text-primary shadow-sm transition hover:bg-primary/5"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
