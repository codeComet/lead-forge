import Anthropic from "@anthropic-ai/sdk";

// Single shared client. Resolves ANTHROPIC_API_KEY from the environment.
export const anthropic = new Anthropic();

/**
 * Force a single structured tool call and return the parsed input object.
 * Used for machine-readable extraction (e.g. the audit insight).
 */
export async function structuredCall({ model, system, user, tool, maxTokens = 2048 }) {
  const res = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "tool_use" && b.name === tool.name);
  if (!block) throw new Error("model did not return the expected tool call");
  return { data: block.input, usage: res.usage };
}

/**
 * Plain text generation. Adaptive thinking for higher-quality long-form output.
 */
export async function textCall({ model, system, user, maxTokens = 2048, thinking = false }) {
  const req = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (thinking) req.thinking = { type: "adaptive" };
  // Stream: large/thinking generations can exceed the SDK's 10-min non-streaming
  // cap. .finalMessage() reassembles the full response either way.
  const res = await anthropic.messages.stream(req).finalMessage();
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { text, usage: res.usage };
}
