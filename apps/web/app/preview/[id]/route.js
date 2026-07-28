import { createServiceClient } from "@/lib/supabase/server";
import { rewriteImageHosts } from "@leadforge/shared/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // The demo pulls Tailwind CDN + picsum images + runs inline JS. Relax CSP
      // for this public preview only (the rest of the app keeps its own headers).
      "Content-Security-Policy":
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: data: blob:; img-src https: data: blob:; font-src https: data:;",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "no-store",
    },
  });
}

const NOT_READY = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview</title></head><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0b0b0f;color:#e5e5e5;text-align:center"><div><div style="width:32px;height:32px;border:3px solid #333;border-top-color:#888;border-radius:50%;margin:0 auto 16px;animation:s 1s linear infinite"></div><p>Your preview is still being built…</p><p style="opacity:.6;font-size:14px">Refresh in a few seconds.</p></div><style>@keyframes s{to{transform:rotate(360deg)}}</style></body></html>`;

export async function GET(_request, { params }) {
  const { id } = await params;
  if (!id) return page("<h1>Not found</h1>", 404);

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[preview] SUPABASE_SERVICE_ROLE_KEY is not set — public preview cannot read RLS-protected website_demos");
    return page("<h1>Preview unavailable</h1><p>Server misconfigured.</p>", 500);
  }

  const supabase = createServiceClient();
  const { data: demo, error } = await supabase
    .from("website_demos")
    .select("id, html, status, views")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[preview] website_demos read failed:", error.message);
    return page("<h1>Preview unavailable</h1>", 500);
  }
  if (!demo) return page("<h1>Preview not found</h1>", 404);
  if (demo.status !== "done" || !demo.html) return page(NOT_READY, 200);

  // Best-effort view count (used for the "preview viewed" signal).
  supabase
    .from("website_demos")
    .update({ views: (demo.views ?? 0) + 1 })
    .eq("id", demo.id)
    .then(() => {}, () => {});

  // loremflickr (the generator's image host) is unreliable — swap its URLs for
  // the Unsplash CDN while keeping the AI-chosen subject + dimensions.
  return page(rewriteImageHosts(demo.html));
}
