import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// The env file lives at the monorepo root; Next only auto-loads from this app's
// directory. Load the root .env manually (no dependency) before config export.
try {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(resolve(here, "../../.env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = val;
  }
} catch {
  // No root .env (e.g. on Vercel where env comes from the platform) — fine.
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @leadforge/shared is a workspace package shipped as source; transpile it.
  transpilePackages: ["@leadforge/shared"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
