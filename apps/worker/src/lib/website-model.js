// Provider dispatcher for website generation. Resolves which AI provider to
// use (based on the org's choice + which API keys are configured) and calls it.
// Adding a provider = a new client module + one case here + a registry entry.

import { getProvider, resolveProvider } from "@leadforge/shared/providers";
import { MODELS } from "@leadforge/shared/constants";
import { generateHtml as geminiGenerate, geminiModel } from "./gemini.js";
import { generateHtml as deepseekGenerate, deepseekModel } from "./deepseek.js";
import { textCall } from "./anthropic.js";

// Generate HTML with an explicit provider. Returns { text, usage, model }.
async function callProvider(provider, { system, user }) {
  switch (provider) {
    case "gemini": {
      const res = await geminiGenerate({ system, user });
      return { ...res, model: geminiModel };
    }
    case "deepseek": {
      const res = await deepseekGenerate({ system, user });
      return { ...res, model: deepseekModel };
    }
    case "claude": {
      // Reuse the Anthropic text client (streams; adaptive thinking for design).
      const res = await textCall({
        model: MODELS.longform,
        system,
        user,
        maxTokens: 32000,
        thinking: true,
      });
      return { text: res.text, usage: res.usage, model: MODELS.longform };
    }
    default:
      throw new Error(`unknown website provider: ${provider}`);
  }
}

/**
 * Resolve the provider for this org and generate. `requested` is the org's
 * saved choice (may be null/invalid); falls back to the first provider whose
 * key is set. Throws if no provider is configured at all.
 * Returns { text, usage, model, provider }.
 */
export async function generateWebsiteHtml({ requested, system, user }) {
  const provider = resolveProvider(requested);
  if (!provider) {
    throw new Error(
      "No AI provider configured — set GEMINI_API_KEY, ANTHROPIC_API_KEY, or DEEPSEEK_API_KEY.",
    );
  }
  const out = await callProvider(provider, { system, user });
  return { ...out, provider, providerLabel: getProvider(provider)?.label };
}
