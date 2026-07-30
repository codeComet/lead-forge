import { GoogleGenAI } from "@google/genai";

// Google Gemini client for website generation. Gemini is used INSTEAD of Claude
// here because (a) the free AI Studio tier makes HTML generation effectively
// free, and (b) 2.5 Pro is strong at visual design. Audits/insights/proposals/
// emails still run on Claude (see lib/anthropic.js).
//
// Env:
//   GEMINI_API_KEY          AI Studio key (free tier). Required for generation.
//   GEMINI_MODEL            default "gemini-2.5-pro" (best design). Set to
//                           "gemini-2.5-flash" for a larger free quota.
//   GEMINI_MAX_TOKENS       max output tokens (default 48000).
//   GEMINI_THINKING_BUDGET  thinking-token budget (default 8192). Kept well
//                           below max so thoughts never starve the HTML output.

export const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-pro";
const MAX_OUTPUT = parseInt(process.env.GEMINI_MAX_TOKENS || "48000", 10);
const THINKING_BUDGET = parseInt(process.env.GEMINI_THINKING_BUDGET || "8192", 10);

let client;
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

/**
 * Generate long-form text (used for full HTML documents).
 * Returns { text, usage: { input_tokens, output_tokens } }.
 */
export async function generateHtml({ system, user, maxTokens = MAX_OUTPUT }) {
  const ai = getClient();
  const res = await ai.models.generateContent({
    model: geminiModel,
    contents: user,
    config: {
      systemInstruction: system,
      maxOutputTokens: maxTokens,
      temperature: 1.0,
      thinkingConfig: { thinkingBudget: THINKING_BUDGET },
    },
  });

  // `res.text` is a getter that aggregates text parts; it can throw or be empty
  // if the response was blocked or hit the token cap before producing content.
  let text = "";
  try {
    text = res.text || "";
  } catch {
    text = "";
  }
  if (!text) {
    const reason =
      res?.candidates?.[0]?.finishReason ||
      res?.promptFeedback?.blockReason ||
      "empty response";
    throw new Error(`Gemini returned no text (${reason})`);
  }

  const u = res.usageMetadata || {};
  const usage = {
    input_tokens: u.promptTokenCount ?? 0,
    output_tokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
  };
  return { text, usage };
}
