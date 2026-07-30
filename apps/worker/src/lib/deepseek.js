// DeepSeek client for website generation. DeepSeek exposes an OpenAI-compatible
// chat-completions API, so we call it directly with fetch (no SDK dependency).
//
// Env:
//   DEEPSEEK_API_KEY    required to use this provider
//   DEEPSEEK_MODEL      default "deepseek-chat" (V3). "deepseek-reasoner" also works.
//   DEEPSEEK_MAX_TOKENS default 8192 (DeepSeek's output cap). A very large
//                       single-file site can bump this ceiling — see the note in
//                       the provider registry.

export const deepseekModel = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const MAX_OUTPUT = parseInt(process.env.DEEPSEEK_MAX_TOKENS || "8192", 10);
const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

export async function generateHtml({ system, user, maxTokens = MAX_OUTPUT }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set");

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: deepseekModel,
      max_tokens: maxTokens,
      temperature: 1.0,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DeepSeek HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = await res.json();
  const choice = json?.choices?.[0];
  const text = choice?.message?.content || "";
  if (!text) throw new Error("DeepSeek returned no text");
  if (choice?.finish_reason === "length") {
    console.warn("[deepseek] output hit the token cap — HTML may be truncated");
  }

  const u = json?.usage || {};
  const usage = {
    input_tokens: u.prompt_tokens ?? 0,
    output_tokens: u.completion_tokens ?? 0,
  };
  return { text, usage };
}
