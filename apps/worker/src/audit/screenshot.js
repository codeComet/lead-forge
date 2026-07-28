import { chromium } from "playwright";
import { supabase } from "../lib/supabase.js";

// Reuse one browser across jobs; launch lazily.
let browserPromise;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = undefined;
  }
}

async function shoot(browser, url, viewport, isMobile) {
  const context = await browser.newContext({
    viewport,
    isMobile,
    deviceScaleFactor: 1,
    userAgent: isMobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 25000 });
  } catch {
    // Fall back to whatever rendered before timeout.
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch {
      await context.close();
      return null;
    }
  }
  await page.waitForTimeout(1200);
  const buf = await page.screenshot({ type: "png", fullPage: false }).catch(() => null);
  await context.close();
  return buf;
}

/**
 * Capture desktop + mobile screenshots and upload to Storage.
 * @returns {{ desktop: string|null, mobile: string|null }} storage paths
 */
export async function captureScreenshots({ orgId, businessId, url }) {
  if (!url) return { desktop: null, mobile: null };
  const browser = await getBrowser();

  const [desktopBuf, mobileBuf] = await Promise.all([
    shoot(browser, url, { width: 1440, height: 900 }, false),
    shoot(browser, url, { width: 390, height: 844 }, true),
  ]);

  const upload = async (buf, name) => {
    if (!buf) return null;
    const path = `${orgId}/${businessId}/${name}.png`;
    const { error } = await supabase.storage
      .from("screenshots")
      .upload(path, buf, { contentType: "image/png", upsert: true });
    if (error) {
      console.error("[screenshot] upload failed:", error.message);
      return null;
    }
    return path;
  };

  const [desktop, mobile] = await Promise.all([
    upload(desktopBuf, "desktop"),
    upload(mobileBuf, "mobile"),
  ]);

  return { desktop, mobile };
}
