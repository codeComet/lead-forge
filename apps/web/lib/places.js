// Google Places API (New) — server-only business discovery.
// Uses Text Search, optionally biased to a geocoded city + radius.

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.rating",
  "places.userRatingCount",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.regularOpeningHours",
  "places.location",
  "places.googleMapsUri",
  "places.primaryTypeDisplayName",
  "places.types",
  "nextPageToken",
].join(",");

// Resolve a "City, Country" string to a lat/lng centre for radius biasing.
async function geocode(query, apiKey) {
  try {
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(query)}&key=${apiKey}`;
    const res = await fetch(url);
    const json = await res.json();
    const loc = json?.results?.[0]?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}

function normalize(p) {
  return {
    place_id: p.id,
    name: p.displayName?.text ?? "Unknown",
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? null,
    address: p.formattedAddress ?? null,
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    opening_hours: p.regularOpeningHours?.weekdayDescriptions ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    maps_url: p.googleMapsUri ?? null,
    primary_type: p.primaryTypeDisplayName?.text ?? null,
  };
}

/**
 * Search businesses via Google Places Text Search.
 * @param {{country?:string, city?:string, radiusM?:number, businessType:string, maxPages?:number}} opts
 * @returns {Promise<object[]>} normalized businesses
 */
export async function searchBusinesses({ country, city, radiusM = 5000, businessType, maxPages = 2 }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_MAPS_API_KEY is not configured");

  const locationText = [city, country].filter(Boolean).join(", ");
  const textQuery = `${businessType}${locationText ? ` in ${locationText}` : ""}`;

  // Try to bias by geocoded centre + radius.
  const centre = locationText ? await geocode(locationText, apiKey) : null;

  const results = [];
  const seen = new Set();
  let pageToken;

  for (let page = 0; page < maxPages; page++) {
    const body = { textQuery, pageSize: 20 };
    if (pageToken) body.pageToken = pageToken;
    if (centre) {
      body.locationBias = {
        circle: {
          center: { latitude: centre.lat, longitude: centre.lng },
          radius: Math.min(Math.max(radiusM, 1), 50000),
        },
      };
    }

    const res = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Places API error ${res.status}: ${err.slice(0, 300)}`);
    }

    const json = await res.json();
    for (const p of json.places ?? []) {
      if (!p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      results.push(normalize(p));
    }

    pageToken = json.nextPageToken;
    if (!pageToken) break;
    // Places requires a short delay before the page token becomes valid.
    await new Promise((r) => setTimeout(r, 2000));
  }

  return results;
}
