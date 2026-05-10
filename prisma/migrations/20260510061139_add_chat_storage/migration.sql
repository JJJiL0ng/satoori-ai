-- CreateEnum
CREATE TYPE "MessageActor" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TranslationDirection" AS ENUM ('satoori-to-seoul', 'seoul-to-satoori');

-- CreateTable
CREATE TABLE "AnonymousSession" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonymousSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "threadToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageType" (
    "id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "MessageType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "typeId" INTEGER NOT NULL,
    "actor" "MessageActor" NOT NULL,
    "direction" "TranslationDirection",
    "inReplyToMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMessageContent" (
    "messageId" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "UserMessageContent_pkey" PRIMARY KEY ("messageId")
);

-- CreateTable
CREATE TABLE "AssistantMessageContent" (
    "messageId" TEXT NOT NULL,
    "translatedText" TEXT NOT NULL,
    "realMeaning" TEXT NOT NULL,
    "emotionLabel" TEXT NOT NULL,
    "responseTip" TEXT NOT NULL,

    CONSTRAINT "AssistantMessageContent_pkey" PRIMARY KEY ("messageId")
);

-- CreateTable
CREATE TABLE "ErrorMessageContent" (
    "messageId" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,

    CONSTRAINT "ErrorMessageContent_pkey" PRIMARY KEY ("messageId")
);

-- SeedData
INSERT INTO "MessageType" ("id", "code", "description") VALUES
    (1, 'USER_INPUT', '사용자가 보낸 원문 메시지'),
    (2, 'ASSISTANT_TRANSLATION', '번역 및 해설이 포함된 AI 응답'),
    (3, 'ASSISTANT_ERROR', 'AI 또는 서버 처리 중 발생한 오류 응답');

-- CreateIndex
CREATE UNIQUE INDEX "AnonymousSession_sessionToken_key" ON "AnonymousSession"("sessionToken");

-- CreateIndex
CREATE INDEX "AnonymousSession_lastSeenAt_idx" ON "AnonymousSession"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_threadToken_key" ON "ChatThread"("threadToken");

-- CreateIndex
CREATE INDEX "ChatThread_sessionId_createdAt_idx" ON "ChatThread"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageType_code_key" ON "MessageType"("code");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_typeId_createdAt_idx" ON "ChatMessage"("typeId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_inReplyToMessageId_idx" ON "ChatMessage"("inReplyToMessageId");

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AnonymousSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MessageType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_inReplyToMessageId_fkey" FOREIGN KEY ("inReplyToMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMessageContent" ADD CONSTRAINT "UserMessageContent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessageContent" ADD CONSTRAINT "AssistantMessageContent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorMessageContent" ADD CONSTRAINT "ErrorMessageContent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
