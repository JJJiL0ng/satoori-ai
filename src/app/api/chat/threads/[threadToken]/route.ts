import { NextResponse } from "next/server";
import { attachThreadCookie, getThreadMessages } from "@/lib/chat-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = {
  params: {
    threadToken: string;
  };
};

export async function GET(_: Request, { params }: Params) {
  try {
    const thread = await getThreadMessages(params.threadToken);

    if (!thread) {
      return NextResponse.json({ error: "채팅을 찾을 수 없습니다." }, { status: 404 });
    }

    return attachThreadCookie(NextResponse.json(thread), thread.threadToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
