export type Direction = "satoori-to-seoul" | "seoul-to-satoori";

export type AssistantResponseType = "translation" | "explanation" | "reply";

export type AssistantPayload = {
  responseType?: AssistantResponseType;
  translated: string;
  realMeaning?: string;
  emotion?: string;
  tip?: string;
};

export type ChatHistoryMessage =
  | {
      role: "user";
      direction: Direction;
      text: string;
    }
  | {
      role: "assistant";
      direction: Direction;
      payload: AssistantPayload;
    };
