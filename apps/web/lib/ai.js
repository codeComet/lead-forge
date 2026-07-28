import Anthropic from "@anthropic-ai/sdk";

// Server-only Claude client for synchronous, on-demand generation (proposals).
// Heavy/batch AI (audits, insights) runs in the worker; this is for quick
// interactive calls where the user waits for the result.
let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
}

export async function textCall({ model, system, user, maxTokens = 1024 }) {
  const c = getClient();
  if (!c) throw new Error("ANTHROPIC_API_KEY is not configured");
  const res = await c.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { text, usage: res.usage };
}
