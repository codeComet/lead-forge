// AI provider registry for website generation.
//
// Each provider is usable only when its API key is present in the environment.
// The frontend asks the server which providers have keys (never the keys
// themselves) and shows only those in the dropdown; the worker uses the same
// registry to resolve which one to actually call.

export const PROVIDERS = [
  {
    id: "gemini",
    label: "Google Gemini",
    envKey: "GEMINI_API_KEY",
    // model is env-overridable per provider (see the worker clients).
    defaultModel: "gemini-2.5-pro",
    note: "Free AI Studio tier · strong at design",
  },
  {
    id: "claude",
    label: "Anthropic Claude",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: "claude-opus-4-8",
    note: "Best quality · paid",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-chat",
    note: "Very cheap · 8K output cap",
  },
];

export const PROVIDER_IDS = PROVIDERS.map((p) => p.id);

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}

// Is a provider's key configured? (Reads the env by default; pass one in for
// testing.)
export function isProviderAvailable(id, env = process.env) {
  const p = getProvider(id);
  return !!(p && env[p.envKey] && String(env[p.envKey]).trim());
}

// Ids of every provider whose key is set, in registry order.
export function availableProviders(env = process.env) {
  return PROVIDERS.filter((p) => isProviderAvailable(p.id, env)).map((p) => p.id);
}

// Public (key-free) view for the frontend dropdown.
export function providerOptions(env = process.env) {
  return PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    note: p.note,
    available: isProviderAvailable(p.id, env),
  }));
}

// Resolve the provider to actually use: a valid requested one, else the first
// available. Returns null if nothing is configured.
export function resolveProvider(requested, env = process.env) {
  const avail = availableProviders(env);
  if (requested && avail.includes(requested)) return requested;
  return avail[0] || null;
}
