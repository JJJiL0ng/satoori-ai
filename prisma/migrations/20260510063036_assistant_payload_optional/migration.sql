-- AlterTable
ALTER TABLE "AssistantMessageContent" ADD COLUMN     "responseType" TEXT,
ALTER COLUMN "realMeaning" DROP NOT NULL,
ALTER COLUMN "emotionLabel" DROP NOT NULL,
ALTER COLUMN "responseTip" DROP NOT NULL;
