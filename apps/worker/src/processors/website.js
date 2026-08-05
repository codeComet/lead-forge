import { buildWebsiteRequest, buildCustomWebsiteRequest } from "@leadforge/shared/prompts";
import { fillTemplate } from "@leadforge/shared/template";
import { supabase } from "../lib/supabase.js";
import { generateWebsiteHtml } from "../lib/website-model.js";
import { extractUrl, scrapeHomepage } from "../lib/scrape-page.js";
import { extractBrandColor } from "../lib/extract-brand-color.js";
import { staticTemplateFor, buildStaticSite } from "../lib/static-template.js";

// Strip accidental markdown fences / prose the model may wrap around the HTML.
function cleanHtml(raw) {
  if (!raw) return "";
  let html = raw.trim();
  // Remove ```html … ``` or ``` … ``` wrappers if present.
  const fence = html.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  if (fence) html = fence[1].trim();
  // If there's leading chatter before the doctype/html, cut to the first tag.
  const start = html.search(/<!doctype html|<html/i);
  if (start > 0) html = html.slice(start);
  return html.trim();
}

const isHtml = (s) => !!s && /<html|<!doctype/i.test(s);

// Normalized industry key for the template cache (same key = same template).
const industryKey = (business) =>
  (business?.business_type || "local business").trim().toLowerCase();

// Number of distinct template variants to build per industry before reusing.
const VARIANTS = Math.max(1, parseInt(process.env.WEBSITE_VARIANTS || "3", 10));

// Stable string hash → pins a business to a variant slot (same business always
// lands on the same variant; different businesses spread across the slots).
function hash(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

async function markFailed(demoId, message) {
  await supabase.from("website_demos").update({ status: "failed", error: message }).eq("id", demoId);
}

// The org's saved provider choice (null = auto → first available key).
async function orgProvider(orgId) {
  const { data } = await supabase
    .from("organizations")
    .select("website_provider")
    .eq("id", orgId)
    .maybeSingle();
  return data?.website_provider ?? null;
}

// Generate an industry-themed demo website for a business.
//
// To keep cost down (this is the heaviest job), we generate ONE template per
// (org, industry) with the org's selected AI provider (Gemini / Claude /
// DeepSeek), then reuse it for every other same-industry business by filling
// placeholder tokens + rotating brand colours in code. Only the first business
// of each industry incurs a model call.
export async function processGenerateWebsite(job) {
  const { demoId, businessId, orgId } = job.data;

  await supabase.from("website_demos").update({ status: "running", error: null }).eq("id", demoId);

  const { data: business, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .single();
  if (error || !business) throw new Error(`business ${businessId} not found`);

  // Custom / redesign mode — the user gave their own prompt (and maybe a URL).
  // This bypasses the whole industry-template cache: it's a one-off, per-business
  // build with the real business values baked in, so we never read or write
  // website_templates and never run fillTemplate.
  const customPrompt = (job.data.customPrompt || "").trim();
  if (customPrompt) {
    return await processCustomWebsite(job, { demoId, businessId, orgId, business, customPrompt });
  }

  // Static pre-built template (e.g. dentists): serve the hand-designed file
  // verbatim, swapping only title + header brand name. No model call, no tokens,
  // no industry cache. Runs even for a forced rebuild — this industry never uses
  // AI. A custom prompt (handled above) is the only way to bypass it.
  const staticFile = staticTemplateFor(business);
  if (staticFile) {
    const html = await buildStaticSite(staticFile, business);
    if (!isHtml(html)) {
      await markFailed(demoId, "static template produced invalid HTML");
      throw new Error("invalid HTML output");
    }
    await supabase
      .from("website_demos")
      .update({ status: "done", html, model: `template:static/${staticFile}`, tokens: 0, error: null })
      .eq("id", demoId);
    return { demoId, businessId, bytes: html.length, static: true };
  }

  const key = industryKey(business);
  // Pin this business to one of the N variant slots for its industry.
  const variant = hash(businessId) % VARIANTS;

  // A deliberate rebuild = force a fresh generation and overwrite the cached
  // template for THIS variant only. Triggered by an explicit force flag (the
  // "Rebuild" button) or by picking a specific provider. Without this, the
  // cache below returns old HTML and the build finishes instantly with no
  // visible change.
  const force = job.data.force || !!job.data.provider;

  // 1. Reuse this industry+variant template if it already exists (no model call)
  //    — unless this is a forced rebuild.
  const { data: tpl } = force
    ? { data: null }
    : await supabase
        .from("website_templates")
        .select("html")
        .eq("org_id", orgId)
        .eq("industry", key)
        .eq("variant", variant)
        .maybeSingle();

  let templateHtml;
  let model;
  let tokens;
  let reused = false;

  if (tpl?.html) {
    templateHtml = tpl.html;
    model = `template:${key}#${variant}`;
    tokens = 0;
    reused = true;
  } else {
    // 2. This variant slot is empty: generate + cache it. Each variant uses a
    //    distinct aesthetic direction so the industry gets 2-3 different looks.
    //    Provider = the org's saved choice (job.data.provider override wins),
    //    falling back to whichever API key is configured.
    const requested = job.data.provider || (await orgProvider(orgId));
    const { system, user } = buildWebsiteRequest(business, variant);
    let res;
    try {
      res = await generateWebsiteHtml({ requested, system, user });
    } catch (e) {
      await markFailed(demoId, e.message);
      throw e;
    }
    templateHtml = cleanHtml(res.text);
    if (!isHtml(templateHtml)) {
      await markFailed(demoId, "model did not return valid HTML");
      throw new Error("invalid HTML output");
    }
    model = res.model;
    tokens = (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);

    // Cache this variant for later same-industry businesses. onConflict dedups
    // if two jobs raced on the same slot (last write wins — harmless).
    const { error: upErr } = await supabase.from("website_templates").upsert(
      { org_id: orgId, industry: key, variant, html: templateHtml, model, tokens },
      { onConflict: "org_id,industry,variant" },
    );
    if (upErr) console.error(`[website] template cache write failed: ${upErr.message}`);
  }

  // 3. Fill the template for this specific business (name/city/phone/colours).
  //    If the business already has a website, sniff its brand colour and recolour
  //    the demo to match; otherwise fillTemplate falls back to a per-business hue
  //    offset. A failed/empty sniff is non-fatal — the demo still builds.
  let brandColor = null;
  if (business.website) {
    try {
      brandColor = await extractBrandColor(business.website);
      if (brandColor) console.log(`[website] brand colour ${brandColor} from ${business.website}`);
    } catch (e) {
      console.warn(`[website] brand colour sniff failed for ${business.website}: ${e.message}`);
    }
  }
  const html = fillTemplate(templateHtml, business, { brandColor });
  if (!isHtml(html)) {
    await markFailed(demoId, "template produced invalid HTML");
    throw new Error("invalid HTML output");
  }

  await supabase
    .from("website_demos")
    .update({ status: "done", html, model, tokens, error: null })
    .eq("id", demoId);

  return { demoId, businessId, bytes: html.length, reused };
}

// Custom / redesign build. One-off per business: no template cache, no token
// fill. If the prompt contains a URL we scrape that homepage and ask the model
// to preserve its sections while restyling; otherwise it's a from-scratch build
// driven purely by the user's instructions.
async function processCustomWebsite(job, { demoId, businessId, orgId, business, customPrompt }) {
  const url = extractUrl(customPrompt);
  let sourceSite = null;
  if (url) {
    try {
      sourceSite = await scrapeHomepage(url);
      if (!sourceSite) console.warn(`[website] redesign source unreachable: ${url}`);
    } catch (e) {
      // A failed scrape shouldn't kill the build — fall back to instructions-only.
      console.warn(`[website] scrape failed for ${url}: ${e.message}`);
    }
  }

  const requested = job.data.provider || (await orgProvider(orgId));
  const { system, user } = buildCustomWebsiteRequest(business, customPrompt, sourceSite);

  let res;
  try {
    res = await generateWebsiteHtml({ requested, system, user });
  } catch (e) {
    await markFailed(demoId, e.message);
    throw e;
  }

  const html = cleanHtml(res.text);
  if (!isHtml(html)) {
    await markFailed(demoId, "model did not return valid HTML");
    throw new Error("invalid HTML output");
  }

  const model = sourceSite ? `custom:redesign` : `custom:prompt`;
  const tokens = (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0);

  await supabase
    .from("website_demos")
    .update({ status: "done", html, model, tokens, error: null })
    .eq("id", demoId);

  return { demoId, businessId, bytes: html.length, custom: true, redesign: !!sourceSite };
}
