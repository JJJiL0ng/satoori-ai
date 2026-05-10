import { NextResponse } from "next/server";
import { getGeminiFlash } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Direction = "satoori-to-seoul" | "seoul-to-satoori";

type TranslateBody = {
  text?: string;
  direction?: Direction;
};

type TranslateResult = {
  translated: string;
  realMeaning: string;
  emotion: string;
  tip: string;
};

const SYSTEM_PROMPT = `너는 "속마음 번역기"다. 경상도 사투리와 서울말 사이를 단순히 단어만 바꾸는 게 아니라, 말투 뒤에 숨은 진짜 감정과 본심까지 풀어 설명한다.

배경:
- 경상도 사람들은 표현이 무뚝뚝하고 짧아서 가족에게 본심을 잘 못 전한다.
- 예: "밥은 묵었나?" 는 안부 질문을 넘어 "걱정하고 있다, 보고싶다" 는 의미인 경우가 많다.
- 예: "마, 됐다" 는 거절이 아니라 "고맙지만 부담 주기 싫다" 인 경우가 많다.

규칙:
1) direction이 "satoori-to-seoul" 이면 입력은 경상도 사투리. 서울 표준어 자연스러운 문장으로 바꿔라.
2) direction이 "seoul-to-satoori" 이면 입력은 서울말(또는 두루뭉실한 표현). 경상도 사람이 실제로 쓸 법한 사투리 한두 문장으로 바꿔라. 너무 과장된 사투리(예능톤)는 피하고 실제 어른들이 쓰는 자연스러운 톤으로.
3) "realMeaning"은 화자가 진짜로 전하고 싶었던 마음을 1~2문장으로 따뜻하게 풀어 써라.
4) "emotion"은 짧은 감정 라벨 (예: "걱정", "고마움 + 미안함", "서툰 애정 표현").
5) "tip"은 듣는 가족이 어떻게 받아들이거나 답하면 좋을지 1문장 조언.
6) 모든 답은 반드시 한국어.

출력은 반드시 아래 JSON 스키마만, 다른 말 없이:
{
  "translated": "...",
  "realMeaning": "...",
  "emotion": "...",
  "tip": "..."
}`;

function buildUserPrompt(text: string, direction: Direction): string {
  const dirLabel =
    direction === "satoori-to-seoul"
      ? "경상도 사투리 → 서울 표준어"
      : "서울말/두루뭉실한 표현 → 경상도 사투리";

  return `방향: ${dirLabel}
입력: """${text}"""

위 규칙대로 JSON만 출력해.`;
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
      typeof parsed.realMeaning === "string" &&
      typeof parsed.emotion === "string" &&
      typeof parsed.tip === "string"
    ) {
      return parsed as TranslateResult;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { text, direction } = (await req.json()) as TranslateBody;

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

    const model = getGeminiFlash();
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: `${SYSTEM_PROMPT}\n\n${buildUserPrompt(text, direction)}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
      },
    });

    const raw = result.response.text();
    const parsed = extractJson(raw);

    if (!parsed) {
      return NextResponse.json(
        { error: "AI 응답을 해석하지 못했습니다.", raw },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
