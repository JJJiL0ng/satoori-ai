import { MessageActor, TranslationDirection } from "@prisma/client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ChatThreadDetailResponse, ChatThreadSummary, StoredChatMessage } from "@/lib/chat-api-types";
import { AssistantPayload, Direction } from "@/lib/chat-types";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "anon_session_token";
const THREAD_COOKIE = "chat_thread_token";

const MESSAGE_TYPE = {
  USER_INPUT: 1,
  ASSISTANT_TRANSLATION: 2,
  ASSISTANT_ERROR: 3,
} as const;

type ChatContext = {
  sessionToken: string;
  threadToken: string;
  sessionId: string;
  threadId: string;
};

function buildToken(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function toDirection(direction: Direction): TranslationDirection {
  return direction === "satoori-to-seoul"
    ? TranslationDirection.SATOORI_TO_SEOUL
    : TranslationDirection.SEOUL_TO_SATOORI;
}

function fromDirection(direction: TranslationDirection | null | undefined): Direction {
  return direction === TranslationDirection.SEOUL_TO_SATOORI
    ? "seoul-to-satoori"
    : "satoori-to-seoul";
}

async function getOrCreateAnonymousSession() {
  const cookieStore = cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value ?? buildToken("sess");
  const now = new Date();

  const session = await prisma.anonymousSession.upsert({
    where: { sessionToken },
    update: { lastSeenAt: now },
    create: {
      sessionToken,
      lastSeenAt: now,
    },
  });

  return { session, sessionToken };
}

export async function getOrCreateChatContext(preferredThreadToken?: string): Promise<ChatContext> {
  const cookieStore = cookies();
  const threadToken = preferredThreadToken ?? cookieStore.get(THREAD_COOKIE)?.value ?? buildToken("thread");
  const { session, sessionToken } = await getOrCreateAnonymousSession();

  const thread = await prisma.chatThread.upsert({
    where: { threadToken },
    update: {},
    create: {
      threadToken,
      sessionId: session.id,
    },
  });

  if (thread.sessionId !== session.id) {
    const reboundThread = await prisma.chatThread.update({
      where: { id: thread.id },
      data: { sessionId: session.id },
    });

    return {
      sessionToken,
      threadToken,
      sessionId: session.id,
      threadId: reboundThread.id,
    };
  }

  return {
    sessionToken,
    threadToken,
    sessionId: session.id,
    threadId: thread.id,
  };
}

export async function createNewChatThread(): Promise<ChatContext> {
  const { session, sessionToken } = await getOrCreateAnonymousSession();
  const threadToken = buildToken("thread");

  const thread = await prisma.chatThread.create({
    data: {
      threadToken,
      sessionId: session.id,
    },
  });

  return {
    sessionToken,
    threadToken,
    sessionId: session.id,
    threadId: thread.id,
  };
}

export function getCurrentThreadToken(): string | null {
  return cookies().get(THREAD_COOKIE)?.value ?? null;
}

function buildThreadTitle(firstUserText: string | null | undefined): string {
  const normalized = firstUserText?.trim();
  if (!normalized) return "새 채팅";
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

function buildThreadPreview(lastMessage: StoredChatMessage | null): string {
  if (!lastMessage) return "아직 메시지가 없습니다.";
  if (lastMessage.role === "user") return lastMessage.text;
  if (lastMessage.role === "assistant") return lastMessage.payload.translated;
  return lastMessage.message;
}

function mapStoredMessage(message: {
  id: string;
  createdAt: Date;
  direction: TranslationDirection | null;
  userContent: { text: string } | null;
  assistantContent: {
    translatedText: string;
    realMeaning: string | null;
    emotionLabel: string | null;
    responseTip: string | null;
  } | null;
  errorContent: { errorMessage: string } | null;
}): StoredChatMessage {
  if (message.userContent) {
    return {
      id: message.id,
      createdAt: message.createdAt.toISOString(),
      role: "user",
      direction: fromDirection(message.direction),
      text: message.userContent.text,
    };
  }

  if (message.assistantContent) {
    return {
      id: message.id,
      createdAt: message.createdAt.toISOString(),
      role: "assistant",
      direction: fromDirection(message.direction),
      payload: {
        translated: message.assistantContent.translatedText,
        realMeaning: message.assistantContent.realMeaning || undefined,
        emotion: message.assistantContent.emotionLabel || undefined,
        tip: message.assistantContent.responseTip || undefined,
      },
    };
  }

  return {
    id: message.id,
    createdAt: message.createdAt.toISOString(),
    role: "assistant-error",
    message: message.errorContent?.errorMessage ?? "알 수 없는 오류",
  };
}

export async function listSessionThreads(): Promise<ChatThreadSummary[]> {
  const { session } = await getOrCreateAnonymousSession();

  const threads = await prisma.chatThread.findMany({
    where: { sessionId: session.id },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          userContent: true,
          assistantContent: true,
          errorContent: true,
        },
      },
    },
  });

  return threads.map((thread) => {
    const storedMessages = thread.messages.map(mapStoredMessage);
    const firstUserMessage = storedMessages.find((message) => message.role === "user");
    const lastMessage = storedMessages.at(-1) ?? null;

    return {
      threadToken: thread.threadToken,
      title: buildThreadTitle(firstUserMessage?.role === "user" ? firstUserMessage.text : null),
      preview: buildThreadPreview(lastMessage),
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
    };
  });
}

export async function getThreadMessages(threadToken: string): Promise<ChatThreadDetailResponse | null> {
  const { session } = await getOrCreateAnonymousSession();

  const thread = await prisma.chatThread.findFirst({
    where: {
      sessionId: session.id,
      threadToken,
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          userContent: true,
          assistantContent: true,
          errorContent: true,
        },
      },
    },
  });

  if (!thread) return null;

  return {
    threadToken: thread.threadToken,
    messages: thread.messages.map(mapStoredMessage),
  };
}

export function attachChatCookies(
  response: NextResponse,
  context: Pick<ChatContext, "sessionToken" | "threadToken">,
) {
  response.cookies.set(SESSION_COOKIE, context.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });

  response.cookies.set(THREAD_COOKIE, context.threadToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export function attachThreadCookie(response: NextResponse, threadToken: string) {
  response.cookies.set(THREAD_COOKIE, threadToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

export async function saveUserMessage(params: {
  threadId: string;
  text: string;
  direction: Direction;
}) {
  return prisma.chatMessage.create({
    data: {
      threadId: params.threadId,
      typeId: MESSAGE_TYPE.USER_INPUT,
      actor: MessageActor.USER,
      direction: toDirection(params.direction),
      userContent: {
        create: {
          text: params.text,
        },
      },
    },
  });
}

export async function saveAssistantTranslation(params: {
  threadId: string;
  direction: Direction;
  inReplyToMessageId: string;
  payload: AssistantPayload;
}) {
  return prisma.chatMessage.create({
    data: {
      threadId: params.threadId,
      typeId: MESSAGE_TYPE.ASSISTANT_TRANSLATION,
      actor: MessageActor.ASSISTANT,
      direction: toDirection(params.direction),
      inReplyToMessageId: params.inReplyToMessageId,
      assistantContent: {
        create: {
          translatedText: params.payload.translated,
          realMeaning: params.payload.realMeaning ?? "",
          emotionLabel: params.payload.emotion ?? "",
          responseTip: params.payload.tip ?? "",
        },
      },
    },
  });
}

export async function saveAssistantError(params: {
  threadId: string;
  direction?: Direction;
  inReplyToMessageId?: string;
  message: string;
}) {
  return prisma.chatMessage.create({
    data: {
      threadId: params.threadId,
      typeId: MESSAGE_TYPE.ASSISTANT_ERROR,
      actor: MessageActor.SYSTEM,
      direction: params.direction ? toDirection(params.direction) : undefined,
      inReplyToMessageId: params.inReplyToMessageId,
      errorContent: {
        create: {
          errorMessage: params.message,
        },
      },
    },
  });
}
