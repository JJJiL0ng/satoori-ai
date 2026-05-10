import { NextResponse } from "next/server";
import { getGeminiFlash } from "@/lib/gemini";
import {
  attachChatCookies,
  getOrCreateChatContext,
  saveAssistantError,
  saveAssistantTranslation,
  saveUserMessage,
} from "@/lib/chat-store";
import {
  AssistantPayload,
  AssistantResponseType,
  ChatHistoryMessage,
  Direction,
} from "@/lib/chat-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TranslateBody = {
  text?: string;
  direction?: Direction;
  history?: ChatHistoryMessage[];
  threadToken?: string;
};

type TranslateResult = {
  responseType?: AssistantResponseType;
  translated: string;
  realMeaning?: string;
  emotion?: string;
  tip?: string;
};

const SYSTEM_PROMPT = `너는 "속마음 번역기"이자 대화형 해석 도우미다. 경상도 사투리와 서울말 사이를 번역할 수 있고, 직전 대화 맥락을 바탕으로 왜 그런 표현이 나왔는지 설명하거나 되묻는 말에 자연스럽게 답할 수도 있다.

배경:
- 경상도 사람들은 표현이 무뚝뚝하고 짧아서 가족에게 본심을 잘 못 전한다.
- 예: "밥은 묵었나?" 는 안부 질문을 넘어 "걱정하고 있다, 보고싶다" 는 의미인 경우가 많다.
- 예: "마, 됐다" 는 거절이 아니라 "고맙지만 부담 주기 싫다" 인 경우가 많다.

규칙:
1) 현재 입력이 실제 번역 요청이면 번역을 해라.
2) 현재 입력이 직전 대화에 대한 되물음, 반응, 의문, 감정 표현이면 기계적으로 직역하지 말고 맥락에 맞는 자연스러운 답변이나 설명을 해라.
3) 번역만으로 충분하면 보조 설명을 억지로 만들지 마라.
4) 속마음 해설이 정말 필요할 때만 "realMeaning", "emotion", "tip"을 넣어라. 필요 없으면 아예 필드를 생략해라.
5) "responseType"은 아래 셋 중 하나만 사용해라.
- "translation": 직접 번역이 중심일 때
- "explanation": 맥락 설명이나 의미 해설이 중심일 때
- "reply": 사용자의 반응에 대화식으로 답하는 것이 중심일 때
6) "translated"는 항상 채워라. 이 필드는 화면의 메인 답변이다. 번역 요청이면 번역문, 설명 요청이면 핵심 설명, 대화 응답이면 자연스러운 답변을 넣어라.
7) 모든 답은 반드시 한국어.
8) 절대로 코드블록, 주석, 머리말, 후행 설명을 붙이지 마라. JSON 객체 하나만 출력해라.

출력 JSON 스키마:
{
  "responseType": "translation" | "explanation" | "reply",
  "translated": "필수 string",
  "realMeaning": "선택 string",
  "emotion": "선택 string",
  "tip": "선택 string"
}`;

function formatDirection(direction: Direction): string {
  return direction === "satoori-to-seoul"
    ? "경상도 사투리 → 서울 표준어"
    : "서울말/두루뭉실한 표현 → 경상도 사투리";
}

function serializeAssistantPayload(payload: AssistantPayload): string {
  const lines = [
    `responseType: ${payload.responseType ?? "translation"}`,
    `translated: ${payload.translated}`,
  ];

  if (payload.emotion) lines.push(`emotion: ${payload.emotion}`);
  if (payload.realMeaning) lines.push(`realMeaning: ${payload.realMeaning}`);
  if (payload.tip) lines.push(`tip: ${payload.tip}`);

  return lines.join("\n");
}

function buildConversationContents(text: string, direction: Direction, history: ChatHistoryMessage[]) {
  const intro = {
    role: "user" as const,
    parts: [
      {
        text: `${SYSTEM_PROMPT}

현재 작업 방향: ${formatDirection(direction)}
이제부터 이어지는 대화 히스토리를 참고해서 마지막 사용자 입력에 답해라.`,
      },
    ],
  };

  const historyContents = history.map((message) => {
    if (message.role === "user") {
      return {
        role: "user" as const,
        parts: [
          {
            text: `방향: ${formatDirection(message.direction)}\n사용자 입력: ${message.text}`,
          },
        ],
      };
    }

    return {
      role: "model" as const,
      parts: [
        {
          text: serializeAssistantPayload(message.payload),
        },
      ],
    };
  });

  const currentTurn = {
    role: "user" as const,
    parts: [
      {
        text: `방향: ${formatDirection(direction)}\n현재 사용자 입력: ${text}\nJSON 객체 하나만 출력해라.`,
      },
    ],
  };

  return [intro, ...historyContents, currentTurn];
}

function isHistoryMessage(value: unknown): value is ChatHistoryMessage {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<ChatHistoryMessage>;
  if (candidate.role === "user") {
    return (
      (candidate.direction === "satoori-to-seoul" || candidate.direction === "seoul-to-satoori") &&
      typeof candidate.text === "string"
    );
  }

  if (candidate.role === "assistant") {
    return (
      (candidate.direction === "satoori-to-seoul" || candidate.direction === "seoul-to-satoori") &&
      !!candidate.payload &&
      typeof candidate.payload === "object" &&
      typeof candidate.payload.translated === "string" &&
      (candidate.payload.responseType === undefined ||
        candidate.payload.responseType === "translation" ||
        candidate.payload.responseType === "explanation" ||
        candidate.payload.responseType === "reply") &&
      (candidate.payload.realMeaning === undefined || typeof candidate.payload.realMeaning === "string") &&
      (candidate.payload.emotion === undefined || typeof candidate.payload.emotion === "string") &&
      (candidate.payload.tip === undefined || typeof candidate.payload.tip === "string")
    );
  }

  return false;
}

function extractJson(raw: string): TranslateResult | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (
      typeof parsed.translated === "string" &&
      (parsed.responseType === undefined ||
        parsed.responseType === "translation" ||
        parsed.responseType === "explanation" ||
        parsed.responseType === "reply") &&
      (parsed.realMeaning === undefined || typeof parsed.realMeaning === "string") &&
      (parsed.emotion === undefined || typeof parsed.emotion === "string") &&
      (parsed.tip === undefined || typeof parsed.tip === "string")
    ) {
      return parsed as TranslateResult;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let chatContext:
    | Awaited<ReturnType<typeof getOrCreateChatContext>>
    | undefined;
  let userMessageId: string | undefined;
  let directionForError: Direction | undefined;

  try {
    const { text, direction, history, threadToken } = (await req.json()) as TranslateBody;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return NextResponse.json(
        { error: "text(string)가 필요합니다." },
        { status: 400 }
      );
    }

    if (direction !== "satoori-to-seoul" && direction !== "seoul-to-satoori") {
      return NextResponse.json(
        { error: "direction은 'satoori-to-seoul' 또는 'seoul-to-satoori' 여야 합니다." },
        { status: 400 }
      );
    }

    if (history !== undefined && (!Array.isArray(history) || !history.every(isHistoryMessage))) {
      return NextResponse.json(
        { error: "history는 순서가 보장된 user/assistant 메시지 배열이어야 합니다." },
        { status: 400 }
      );
    }

    const normalizedHistory = history ?? [];

    directionForError = direction;
    chatContext = await getOrCreateChatContext(threadToken);
    const userMessage = await saveUserMessage({
      threadId: chatContext.threadId,
      text: text.trim(),
      direction,
    });
    userMessageId = userMessage.id;

    if (!userMessageId) {
      throw new Error("사용자 메시지 저장에 실패했습니다.");
    }

    const model = getGeminiFlash();
    const result = await model.generateContent({
      contents: buildConversationContents(text, direction, normalizedHistory),
      generationConfig: {
        temperature: 0.85,
        responseMimeType: "application/json",
      },
    });

    const raw = result.response.text();
    const parsed = extractJson(raw);

    if (!parsed) {
      if (chatContext) {
        await saveAssistantError({
          threadId: chatContext.threadId,
          direction,
          inReplyToMessageId: userMessageId,
          message: "AI 응답을 해석하지 못했습니다.",
        });
      }

      const response = NextResponse.json(
        { error: "AI 응답을 해석하지 못했습니다.", raw },
        { status: 502 }
      );

      return chatContext ? attachChatCookies(response, chatContext) : response;
    }

    await saveAssistantTranslation({
      threadId: chatContext.threadId,
      direction,
      inReplyToMessageId: userMessageId,
      payload: parsed,
    });

    return attachChatCookies(NextResponse.json(parsed), chatContext);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (chatContext) {
      await saveAssistantError({
        threadId: chatContext.threadId,
        direction: directionForError,
        inReplyToMessageId: userMessageId,
        message,
      });
    }

    return chatContext
      ? attachChatCookies(NextResponse.json({ error: message }, { status: 500 }), chatContext)
      : NextResponse.json({ error: message }, { status: 500 });
  }
}
