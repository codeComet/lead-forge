// Reliable, subject-matched imagery for generated website demos.
//
// The AI generator emits keyword-based image URLs (loremflickr) so each photo
// matches the business's industry. loremflickr's Flickr backend is flaky — the
// same URL flips between 200 and 500 per request — which is why demo images
// render broken. This module rewrites those URLs to the Unsplash image CDN
// (rock-solid, fast) while preserving the AI's chosen subject via a curated
// keyword → photo pool. Same dimensions in, same dimensions out, so layouts
// are untouched.

// Curated, verified Unsplash photo IDs grouped by subject.
const POOLS = {
  food: ["1504674900247-0877df9cc836", "1414235077428-338989a2e8c0"],
  seafood: ["1467003909585-2f8a72700288", "1476224203421-9ac39bcb3327"],
  dessert: ["1432139555190-58524dae6a55", "1495147466023-ac5c588e2e94", "1551024601-bec78aea704b"],
  steak: ["1510812431401-41d2bd2722f3", "1544025162-d76694265947"],
  wine: ["1510626176961-4b57d4fbad03", "1553361371-9b22f78e8b1d"],
  salad: ["1546069901-ba9599a7e63c"],
  soup: ["1547592180-85f173990554"],
  dining: ["1424847651672-bf20a4b0982b"],
  interior: ["1552566626-52f8b828add9", "1517248135467-4c7edcad34c4"],
  chef: ["1577219491135-ce391730fb2c"],
  kitchen: ["1556910103-1c02745aae4d"],
  gym: ["1534438327276-14e5300c3a48", "1571019613454-1cb2f99b2d8b"],
  salon: ["1560066984-138dadb4c035", "1522337360788-8b13dee7a37e"],
  office: ["1497366216548-37526070297c", "1600880292203-757bb62b4baf"],
  law: ["1521791136064-7986c2920216"],
  dental: ["1588776814546-1ffcf47267a5"],
};

// Fallback when no keyword matches — neutral, professional business imagery.
const FALLBACK = POOLS.office;

// Keyword (substring) → canonical pool. First match wins, so order matters:
// more specific terms come before broader ones.
const ALIASES = [
  [["seafood", "fish", "oyster", "salmon", "shrimp"], "seafood"],
  [["dessert", "cake", "pastry", "sweet", "bakery", "chocolate"], "dessert"],
  [["steak", "meat", "grill", "bbq", "beef", "burger"], "steak"],
  [["wine", "cocktail", "drink", "bar", "glass", "beer", "coffee"], "wine"],
  [["salad", "vegan", "vegetable", "veggie", "healthy"], "salad"],
  [["soup", "bowl", "ramen", "broth", "noodle"], "soup"],
  [["chef", "cook", "cooking"], "chef"],
  [["kitchen"], "kitchen"],
  [["restaurant", "interior", "cafe", "bistro", "diner", "lounge", "seating"], "interior"],
  [["dining", "table", "dinner", "lunch", "brunch"], "dining"],
  [["gym", "fitness", "workout", "training", "dumbbell", "exercise", "yoga"], "gym"],
  [["salon", "hair", "haircut", "hairstyle", "beauty", "barber", "spa", "nails"], "salon"],
  [["law", "lawyer", "attorney", "legal", "court", "justice", "handshake"], "law"],
  [["dentist", "dental", "teeth", "tooth", "clinic", "medical", "doctor", "health", "orthodont"], "dental"],
  [["office", "business", "corporate", "company", "meeting", "desk", "workspace"], "office"],
  // Broad food terms last so specific dishes above win.
  [["food", "gourmet", "meal", "cuisine", "dish", "plating", "plate", "menu", "mushroom", "forest", "foraging", "farm", "organic"], "food"],
];

function poolFor(keywords) {
  const hay = keywords.toLowerCase();
  for (const [terms, key] of ALIASES) {
    if (terms.some((t) => hay.includes(t))) return POOLS[key];
  }
  return FALLBACK;
}

// Small deterministic hash so images without a numeric lock still vary stably.
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function unsplash(id, w, h) {
  const width = Math.min(Math.max(parseInt(w, 10) || 1200, 1), 2000);
  const height = Math.min(Math.max(parseInt(h, 10) || 800, 1), 2000);
  return `https://images.unsplash.com/photo-${id}?w=${width}&h=${height}&fit=crop&crop=entropy&auto=format&q=75`;
}

// Matches a loremflickr URL: /<w>/<h>/<comma-keywords>?lock=<n>
const LOREMFLICKR_RE =
  /https?:\/\/(?:www\.)?loremflickr\.com\/(\d+)\/(\d+)\/([^"'\s?)]+)(?:\?lock=(\d+))?/gi;

// Resolve one loremflickr URL to a stable Unsplash URL. Non-loremflickr URLs
// are returned untouched.
export function resolveImageUrl(url) {
  return url.replace(LOREMFLICKR_RE, (_m, w, h, keywords, lock) => {
    const pool = poolFor(decodeURIComponent(keywords));
    const seed = lock != null ? parseInt(lock, 10) : hash(keywords);
    return unsplash(pool[seed % pool.length], w, h);
  });
}

// Rewrite every flaky image URL in an HTML string to a reliable one.
export function rewriteImageHosts(html) {
  if (!html || typeof html !== "string") return html;
  return html.replace(LOREMFLICKR_RE, (m) => resolveImageUrl(m));
}
