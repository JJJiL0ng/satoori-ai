import { NextResponse } from "next/server";
import { attachChatCookies, createNewChatThread } from "@/lib/chat-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const chatContext = await createNewChatThread();
    return attachChatCookies(
      NextResponse.json({ ok: true, threadToken: chatContext.threadToken }),
      chatContext,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
