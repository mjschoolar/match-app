// app/api/build-pool-p1/route.ts
// V2.2.1 — Pool builder, page 1. Added session event logging.
//
// Fetches the first page of results (up to 20) for all 22 Match cuisine
// categories at a 15-mile radius around the session location. Uses the
// Places API (New) Text Search endpoint — Text Search supports pagination
// via nextPageToken; searchNearby does not.
//
// Applies venue filter and quality floor only. Open hours, price, and
// distance are NOT filtered here — the pool represents the full market,
// and those filters are session-specific, applied at generate time.
//
// Writes to Firebase:
//   sessions/{sessionId}/pool/{cuisineId}/p1           — filtered restaurants
//   sessions/{sessionId}/pool/{cuisineId}/nextPageToken — token for p2, or null
//   sessions/{sessionId}/categoryCoverage               — replaces check-coverage route
//
// Fires p2 without awaiting (fire-and-forget). Returns immediately.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { ref, set } from "firebase/database";
import { logEvent } from "@/lib/logEvent";

const TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

// Minimal field mask for pool build — covers everything needed for filtering,
// sampling, and photo selection. nextPageToken MUST be included or the API
// will not return it. Full details (address, phone, etc.) are fetched at
// generate time for the 25 selected restaurants only.
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

// 15-mile radius — intentionally wider than any realistic session distance.
// The pool represents the full local market; the session's chosen distance
// is applied as a filter at generate time.
const POOL_RADIUS_MILES = 15;

// Match category ID → Google Places type (mirrors generate-stack)
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

// Category labels used in the text query (e.g. "American restaurant")
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

// Entertainment venues that return in restaurant searches — mirrors generate-stack
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

// Compute a bounding rectangle approximating the pool radius.
// Text Search locationRestriction supports only rectangle (not circle).
// At 15 miles, corners extend ~21 miles from center — acceptable for a market pool.
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

async function fetchCategoryPage1(
  key: string,
  cuisineId: string,
  lat: number,
  lng: number
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
      }),
      signal: controller.signal,
    });

    const data = await resp.json();

    if (data.error) {
      console.error(`[build-pool-p1] API error for ${cuisineId}:`, data.error.message);
      return { places: [], nextPageToken: null };
    }

    return {
      places: (data.places as Record<string, unknown>[]) || [],
      nextPageToken: (data.nextPageToken as string) || null,
    };
  } catch (err) {
    const isTimeout = (err as Error).name === "AbortError";
    console.error(`[build-pool-p1] ${isTimeout ? "Timeout" : "Error"} for ${cuisineId}`);
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

  const startTime = Date.now();
  logEvent(db, sessionId, "pool.p1.started", { lat, lng });

  try {
    // Fetch all 22 categories in parallel
    const fetchResults = await Promise.all(
      Object.keys(TYPE_MAP).map(async (cuisineId) => {
        const { places, nextPageToken } = await fetchCategoryPage1(key, cuisineId, lat, lng);
        const filtered = places.filter(
          (p) => passesVenueFilter(p) && passesQualityFloor(p)
        );
        return { cuisineId, places: filtered, nextPageToken };
      })
    );

    // Build pool data and derive coverage from p1 results
    const poolData: Record<string, unknown> = {};
    const coverage: Record<string, boolean> = {};

    for (const { cuisineId, places, nextPageToken } of fetchResults) {
      poolData[cuisineId] = { p1: places, nextPageToken };
      // A category has coverage if at least one qualifying restaurant was found
      coverage[cuisineId] = places.length > 0;
    }

    // Write pool data and categoryCoverage to Firebase
    await set(ref(db, `sessions/${sessionId}/pool`), poolData);
    await set(ref(db, `sessions/${sessionId}/categoryCoverage`), coverage);

    // Log completion with per-category counts and token list
    const categoryCounts = Object.fromEntries(
      fetchResults.map(({ cuisineId, places }) => [cuisineId, places.length])
    );
    const categoriesWithTokens = fetchResults
      .filter(({ nextPageToken }) => nextPageToken !== null)
      .map(({ cuisineId }) => cuisineId);
    const totalQualifying = fetchResults.reduce((sum, { places }) => sum + places.length, 0);

    logEvent(db, sessionId, "pool.p1.completed", {
      durationMs: Date.now() - startTime,
      categoryCounts,
      categoriesWithTokens,
      totalQualifying,
      coverageWritten: true,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[build-pool-p1] Fatal error:", message, "sessionId:", sessionId);
    logEvent(db, sessionId, "error", {
      route: "build-pool-p1",
      message,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json({ error: "Pool build p1 failed" }, { status: 500 });
  }
}
