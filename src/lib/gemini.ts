import "server-only";
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

let cachedClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  cachedClient = new GoogleGenerativeAI(apiKey);
  return cachedClient;
}

export function getGeminiFlash(): GenerativeModel {
  return getClient().getGenerativeModel({ model: "gemini-2.5-flash" });
}

export function getGeminiPro(): GenerativeModel {
  return getClient().getGenerativeModel({ model: "gemini-2.5-pro" });
}
