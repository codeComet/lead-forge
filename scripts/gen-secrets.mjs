#!/usr/bin/env node
// Generate the crypto secrets LeadForge's Docker stack needs and write them into
// ./.env (created from .env.docker.example on first run). Only fills values that
// are still blank — re-running never clobbers keys you've already set.
//
//   node scripts/gen-secrets.mjs          # patch ./.env
//   node scripts/gen-secrets.mjs --print  # just print, don't write
//
// ANON_KEY / SERVICE_ROLE_KEY are HS256 JWTs signed with JWT_SECRET, exactly the
// format self-hosted Supabase (GoTrue/PostgREST/Storage/Realtime) expects.

import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
const examplePath = resolve(root, ".env.docker.example");
const printOnly = process.argv.includes("--print");

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

const rand = (bytes) => randomBytes(bytes).toString("hex"); // hex → url-safe, no shell quoting pain

// ── build the secret set ────────────────────────────────────────────
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 60 * 60 * 24 * 365 * 10; // 10 years
const JWT_SECRET = rand(32); // 64 hex chars

const secrets = {
  POSTGRES_PASSWORD: rand(24),
  JWT_SECRET,
  ANON_KEY: signJwt({ role: "anon", iss: "supabase", iat, exp }, JWT_SECRET),
  SERVICE_ROLE_KEY: signJwt({ role: "service_role", iss: "supabase", iat, exp }, JWT_SECRET),
  SECRET_KEY_BASE: rand(32),
  DASHBOARD_PASSWORD: rand(12),
};

if (printOnly) {
  for (const [k, v] of Object.entries(secrets)) console.log(`${k}=${v}`);
  process.exit(0);
}

// ── patch .env (create from example if absent) ──────────────────────
if (!existsSync(envPath)) {
  if (!existsSync(examplePath)) {
    console.error("Missing .env and .env.docker.example — run from repo root.");
    process.exit(1);
  }
  copyFileSync(examplePath, envPath);
  console.log("Created .env from .env.docker.example");
}

let env = readFileSync(envPath, "utf8");
const filled = [];
const skipped = [];

for (const [key, value] of Object.entries(secrets)) {
  const re = new RegExp(`^(${key}=)(.*)$`, "m");
  const m = env.match(re);
  if (m && m[2].trim() !== "") {
    skipped.push(key); // already set — leave it
    continue;
  }
  if (m) {
    env = env.replace(re, `$1${value}`);
  } else {
    env += `\n${key}=${value}`;
  }
  filled.push(key);
}

writeFileSync(envPath, env);
console.log(`\nWrote ${filled.length} secret(s) to .env: ${filled.join(", ") || "(none)"}`);
if (skipped.length) console.log(`Kept existing:            ${skipped.join(", ")}`);
console.log("\nNext: set SITE_URL, SUPABASE_PUBLIC_URL, ANTHROPIC_API_KEY, GOOGLE_MAPS_API_KEY in .env");
