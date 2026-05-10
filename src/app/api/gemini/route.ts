import { NextResponse } from "next/server";
import { getGeminiFlash } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { prompt } = (await req.json()) as { prompt?: string };

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "prompt(string)가 필요합니다." },
        { status: 400 }
      );
    }

    const result = await getGeminiFlash().generateContent(prompt);
    const text = result.response.text();

    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
