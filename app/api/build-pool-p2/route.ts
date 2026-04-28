// app/api/build-pool-p2/route.ts
// V2.2 — Pool builder, page 2.
//
// Called by build-pool-p1 (fire-and-forget). Reads the nextPageToken stored
// by p1 for each category and fetches page 2 for categories where a token
// exists. Skips Fast Food regardless — page 1 is sufficient for that type.
//
// Writes to Firebase:
//   sessions/{sessionId}/pool/{cuisineId}/p2            — filtered restaurants
//   sessions/{sessionId}/pool/{cuisineId}/nextPageToken2 — token for p3, or null
//
// Fires p3 without awaiting (fire-and-forget). Returns immediately.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { ref, get, update } from "firebase/database";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

const POOL_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.types",
  "places.location",
  "places.regularOpeningHours",
  "places.photos",
  "nextPageToken",
].join(",");

const POOL_RADIUS_MILES = 15;

const TYPE_MAP: Record<string, string> = {
  "american":       "american_restaurant",
  "italian":        "italian_restaurant",
  "mexican":        "mexican_restaurant",
  "chinese":        "chinese_restaurant",
  "japanese":       "japanese_restaurant",
  "indian":         "indian_restaurant",
  "thai":           "thai_restaurant",
  "korean":         "korean_restaurant",
  "mediterranean":  "mediterranean_restaurant",
  "vietnamese":     "vietnamese_restaurant",
  "seafood":        "seafood_restaurant",
  "french":         "french_restaurant",
  "pizza":          "pizza_restaurant",
  "burgers":        "hamburger_restaurant",
  "bbq":            "barbecue_restaurant",
  "fast-food":      "fast_food_restaurant",
  "middle-eastern": "middle_eastern_restaurant",
  "ethiopian":      "ethiopian_restaurant",
  "filipino":       "filipino_restaurant",
  "caribbean":      "caribbean_restaurant",
  "latin-american": "latin_american_restaurant",
  "spanish":        "spanish_restaurant",
};

const CATEGORY_LABELS: Record<string, string> = {
  "american":       "American",
  "italian":        "Italian",
  "mexican":        "Mexican",
  "chinese":        "Chinese",
  "japanese":       "Japanese",
  "indian":         "Indian",
  "thai":           "Thai",
  "korean":         "Korean",
  "mediterranean":  "Mediterranean",
  "vietnamese":     "Vietnamese",
  "seafood":        "Seafood",
  "french":         "French",
  "pizza":          "Pizza",
  "burgers":        "Burgers",
  "bbq":            "BBQ",
  "fast-food":      "Fast Food",
  "middle-eastern": "Middle Eastern",
  "ethiopian":      "Ethiopian",
  "filipino":       "Filipino",
  "caribbean":      "Caribbean",
  "latin-american": "Latin American",
  "spanish":        "Spanish",
};

const EXCLUDED_VENUE_TYPES = new Set([
  "amusement_center",
  "amusement_park",
  "bowling_alley",
  "golf_course",
  "event_venue",
  "performing_arts_theater",
  "stadium",
  "casino",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function boundingBox(lat: number, lng: number) {
  const dLat = POOL_RADIUS_MILES / 69;
  const dLng = POOL_RADIUS_MILES / (69 * Math.cos((lat * Math.PI) / 180));
  return {
    low:  { latitude: lat - dLat, longitude: lng - dLng },
    high: { latitude: lat + dLat, longitude: lng + dLng },
  };
}

function passesVenueFilter(place: Record<string, unknown>): boolean {
  const types = place.types as string[] | undefined;
  if (!types) return true;
  return !types.some((t) => EXCLUDED_VENUE_TYPES.has(t));
}

function passesQualityFloor(place: Record<string, unknown>): boolean {
  if (((place.rating as number) ?? 0) < 3.8) return false;
  if (((place.userRatingCount as number) ?? 0) < 30) return false;
  return true;
}

// ── Places API call ───────────────────────────────────────────────────────────

async function fetchCategoryPage2(
  key: string,
  cuisineId: string,
  lat: number,
  lng: number,
  pageToken: string
): Promise<{ places: Record<string, unknown>[]; nextPageToken: string | null }> {
  const label = CATEGORY_LABELS[cuisineId];
  const placeType = TYPE_MAP[cuisineId];
  if (!placeType) return { places: [], nextPageToken: null };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const resp = await fetch(TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": POOL_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: `${label} restaurant`,
        includedType: placeType,
        locationRestriction: { rectangle: boundingBox(lat, lng) },
        maxResultCount: 20,
        pageToken,
      }),
      signal: controller.signal,
    });

    const data = await resp.json();

    if (data.error) {
      console.error(`[build-pool-p2] API error for ${cuisineId}:`, data.error.message);
      return { places: [], nextPageToken: null };
    }

    return {
      places: (data.places as Record<string, unknown>[]) || [],
      nextPageToken: (data.nextPageToken as string) || null,
    };
  } catch (err) {
    const isTimeout = (err as Error).name === "AbortError";
    console.error(`[build-pool-p2] ${isTimeout ? "Timeout" : "Error"} for ${cuisineId}`);
    return { places: [], nextPageToken: null };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const body = await req.json() as { sessionId?: string; lat?: number; lng?: number };
  const { sessionId, lat, lng } = body;

  if (!sessionId || typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json(
      { error: "sessionId, lat, and lng are required" },
      { status: 400 }
    );
  }

  // Read the pool written by p1 to find which categories have a nextPageToken
  const poolSnap = await get(ref(db, `sessions/${sessionId}/pool`));
  const pool = poolSnap.val() as Record<string, { p1?: unknown[]; nextPageToken?: string | null }> | null;

  if (!pool) {
    console.error(`[build-pool-p2] No pool data found for session ${sessionId}`);
    return NextResponse.json({ error: "Pool not found" }, { status: 404 });
  }

  // Determine which categories need a page 2 fetch:
  //   - nextPageToken is present (API hit its 20-result cap and has more)
  //   - not "fast-food" (excluded from pagination by design — page 1 is sufficient)
  const categoriesToFetch = Object.keys(TYPE_MAP).filter((cuisineId) => {
    if (cuisineId === "fast-food") return false;
    const token = pool[cuisineId]?.nextPageToken;
    return typeof token === "string" && token.length > 0;
  });

  if (categoriesToFetch.length === 0) {
    // Nothing to paginate — fire p3 anyway so it can write pool/complete
    const appUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    fetch(`${appUrl}/api/build-pool-p3`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, lat, lng }),
    }).catch((err) => console.error("[build-pool-p2] Failed to fire p3:", err));

    return NextResponse.json({ ok: true, fetched: 0 });
  }

  // Fetch page 2 for qualifying categories in parallel
  const fetchResults = await Promise.all(
    categoriesToFetch.map(async (cuisineId) => {
      const pageToken = pool[cuisineId]!.nextPageToken as string;
      const { places, nextPageToken } = await fetchCategoryPage2(key, cuisineId, lat, lng, pageToken);
      const filtered = places.filter(
        (p) => passesVenueFilter(p) && passesQualityFloor(p)
      );
      return { cuisineId, places: filtered, nextPageToken };
    })
  );

  // Write p2 results and nextPageToken2 values using a multi-path update
  const updates: Record<string, unknown> = {};
  for (const { cuisineId, places, nextPageToken } of fetchResults) {
    updates[`sessions/${sessionId}/pool/${cuisineId}/p2`] = places;
    updates[`sessions/${sessionId}/pool/${cuisineId}/nextPageToken2`] = nextPageToken ?? null;
  }
  await update(ref(db), updates);

  // Fire p3 without awaiting
  const appUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  fetch(`${appUrl}/api/build-pool-p3`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, lat, lng }),
  }).catch((err) => console.error("[build-pool-p2] Failed to fire p3:", err));

  return NextResponse.json({ ok: true, fetched: categoriesToFetch.length });
}
