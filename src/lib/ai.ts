import OpenAI from "openai";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-chat";

function sanitizeAscii(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^\x20-\x7E]/g, "").trim();
  return cleaned || undefined;
}

export function getAiConfig() {
  const apiKey = sanitizeAscii(
    process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY
  );
  const baseURL = process.env.OPENAI_BASE_URL ?? DEEPSEEK_BASE_URL;
  const usesDeepSeek = /deepseek/i.test(baseURL);
  const model =
    process.env.OPENAI_MODEL ??
    process.env.DEEPSEEK_MODEL ??
    (usesDeepSeek ? DEEPSEEK_MODEL : "gpt-4o-mini");

  return { apiKey, baseURL, model, usesDeepSeek };
}

export function createAiClient(): OpenAI {
  const { apiKey, baseURL } = getAiConfig();

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY no configurada");
  }

  return new OpenAI({ apiKey, baseURL });
}
