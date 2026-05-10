import { NextResponse } from "next/server";
import { getCurrentThreadToken, listSessionThreads } from "@/lib/chat-store";
import { ChatThreadsResponse } from "@/lib/chat-api-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const threads = await listSessionThreads();
    const activeThreadToken = getCurrentThreadToken() ?? threads[0]?.threadToken ?? null;

    const body: ChatThreadsResponse = {
      activeThreadToken,
      threads,
    };

    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
