// app/api/build-pool-p3/route.ts
// V2.2.1 — Pool builder, page 3. Added session event logging.
//
// Called by build-pool-p2 (fire-and-forget). Same pattern as p2 — reads
// nextPageToken2 values written by p2 and fetches page 3 for categories
// that still have a token. Skips Fast Food regardless.
//
// Writes to Firebase:
//   sessions/{sessionId}/pool/{cuisineId}/p3  — filtered restaurants
//   sessions/{sessionId}/pool/complete: true   — signals pool is ready
//
// generate-stack reads pool/complete to decide whether to use the pool path
// or fall back to direct API calls. This is the last route in the chain.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { ref, get, update, set } from "firebase/database";
import { logEvent } from "@/lib/logEvent";

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

async function fetchCategoryPage3(
  key: string,
  cuisineId: string,
  lat: number,
  lng: number,
  pageToken: string
): Promise<Record<string, unknown>[]> {
  const label = CATEGORY_LABELS[cuisineId];
  const placeType = TYPE_MAP[cuisineId];
  if (!placeType) return [];

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
      console.error(`[build-pool-p3] API error for ${cuisineId}:`, data.error.message);
      return [];
    }

    return (data.places as Record<string, unknown>[]) || [];
  } catch (err) {
    const isTimeout = (err as Error).name === "AbortError";
    console.error(`[build-pool-p3] ${isTimeout ? "Timeout" : "Error"} for ${cuisineId}`);
    return [];
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

  try {
    // Read pool to find categories with a nextPageToken2 (written by p2)
    const poolSnap = await get(ref(db, `sessions/${sessionId}/pool`));
    const pool = poolSnap.val() as Record<string, { nextPageToken2?: string | null }> | null;

    if (!pool) {
      console.error(`[build-pool-p3] No pool data found for session ${sessionId}`);
      logEvent(db, sessionId, "error", {
        route: "build-pool-p3",
        message: "No pool data found — marking complete with what we have",
      });
      await set(ref(db, `sessions/${sessionId}/pool/complete`), true);
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    // Categories eligible for page 3: have a nextPageToken2 and are not fast-food
    const categoriesToFetch = Object.keys(TYPE_MAP).filter((cuisineId) => {
      if (cuisineId === "fast-food") return false;
      const token = pool[cuisineId]?.nextPageToken2;
      return typeof token === "string" && token.length > 0;
    });

    logEvent(db, sessionId, "pool.p3.started", { categoriesToFetch });

    if (categoriesToFetch.length > 0) {
      const fetchResults = await Promise.all(
        categoriesToFetch.map(async (cuisineId) => {
          const pageToken = pool[cuisineId]!.nextPageToken2 as string;
          const places = await fetchCategoryPage3(key, cuisineId, lat, lng, pageToken);
          const filtered = places.filter(
            (p) => passesVenueFilter(p) && passesQualityFloor(p)
          );
          return { cuisineId, places: filtered };
        })
      );

      // Write p3 results using a multi-path update
      const updates: Record<string, unknown> = {};
      for (const { cuisineId, places } of fetchResults) {
        updates[`sessions/${sessionId}/pool/${cuisineId}/p3`] = places;
      }
      await update(ref(db), updates);

      const categoryCounts = Object.fromEntries(
        fetchResults.map(({ cuisineId, places }) => [cuisineId, places.length])
      );
      const totalNewQualifying = fetchResults.reduce((sum, { places }) => sum + places.length, 0);

      logEvent(db, sessionId, "pool.p3.completed", {
        durationMs: Date.now() - startTime,
        categoryCounts,
        totalNewQualifying,
        poolBuildComplete: true,
      });
    } else {
      logEvent(db, sessionId, "pool.p3.completed", {
        durationMs: Date.now() - startTime,
        categoryCounts: {},
        totalNewQualifying: 0,
        poolBuildComplete: true,
      });
    }

    // Write pool/complete: true — signals to generate-stack that the full pool is ready
    await set(ref(db, `sessions/${sessionId}/pool/complete`), true);

    return NextResponse.json({ ok: true, fetched: categoriesToFetch.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[build-pool-p3] Fatal error:", message, "sessionId:", sessionId);
    logEvent(db, sessionId, "error", {
      route: "build-pool-p3",
      message,
      durationMs: Date.now() - startTime,
    });
    // Still write complete so generate-stack can proceed with what's available
    await set(ref(db, `sessions/${sessionId}/pool/complete`), true).catch(() => {});
    return NextResponse.json({ error: "Pool build p3 failed" }, { status: 500 });
  }
}
