import { AssistantPayload, Direction } from "@/lib/chat-types";

export type ChatThreadSummary = {
  threadToken: string;
  title: string;
  preview: string;
  updatedAt: string;
  createdAt: string;
};

export type StoredChatMessage =
  | {
      id: string;
      createdAt: string;
      role: "user";
      direction: Direction;
      text: string;
    }
  | {
      id: string;
      createdAt: string;
      role: "assistant";
      direction: Direction;
      payload: AssistantPayload;
    }
  | {
      id: string;
      createdAt: string;
      role: "assistant-error";
      message: string;
    };

export type ChatThreadsResponse = {
  activeThreadToken: string | null;
  threads: ChatThreadSummary[];
};

export type ChatThreadDetailResponse = {
  threadToken: string;
  messages: StoredChatMessage[];
};
