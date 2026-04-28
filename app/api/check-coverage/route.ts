// app/api/check-coverage/route.ts
// Change 7: Contextual category filtering.
//
// For each of the 22 Match cuisine categories, makes a minimal Places API call
// (places.id field mask only — cheapest request) at a 10-mile radius to detect
// whether any restaurants of that type exist in the market. Runs all 22 calls
// in parallel. Writes results to Firebase as categoryCoverage.
//
// 10 miles is intentionally wider than any realistic session radius — the purpose
// is to detect categories genuinely absent from the market, not to predict
// coverage at the exact session radius.
//
// Fail-open: if any individual call fails or times out, that category defaults
// to true (visible in the grid). Never hide a category because the check failed.
//
// Called by the creator's device immediately after location is written to Firebase,
// during the lobby phase, before the preference step.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { ref, set } from "firebase/database";

const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const COVERAGE_RADIUS_METERS = 16093; // 10 miles

// Match category ID → Google Places type (same mapping as generate-stack)
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

export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const body = await req.json() as {
    sessionId?: string;
    lat?: number;
    lng?: number;
  };
  const { sessionId, lat, lng } = body;

  if (!sessionId || typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json(
      { error: "sessionId, lat, and lng are required" },
      { status: 400 }
    );
  }

  const coverage: Record<string, boolean> = {};

  // Run all 22 category checks in parallel
  await Promise.all(
    Object.entries(TYPE_MAP).map(async ([cuisineId, placeType]) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      try {
        const resp = await fetch(NEARBY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "places.id",  // minimum billable request
          },
          body: JSON.stringify({
            includedTypes: [placeType],
            locationRestriction: {
              circle: {
                center: { latitude: lat, longitude: lng },
                radius: COVERAGE_RADIUS_METERS,
              },
            },
            maxResultCount: 1,  // only need to know if any exist
          }),
          signal: controller.signal,
        });

        const data = await resp.json();

        if (data.error) {
          // API returned an error — fail-open (show the category)
          console.warn(`[check-coverage] API error for ${cuisineId}:`, data.error.message);
          coverage[cuisineId] = true;
        } else {
          // Category has coverage if at least one result was returned
          coverage[cuisineId] = (data.places?.length ?? 0) > 0;
        }
      } catch {
        // Timeout or network error — fail-open
        coverage[cuisineId] = true;
      } finally {
        clearTimeout(timeoutId);
      }
    })
  );

  // If all categories came back false (catastrophic failure or extremely remote location),
  // default all to true — never show an empty grid
  const hasAnyCoverage = Object.values(coverage).some((v) => v === true);
  if (!hasAnyCoverage) {
    for (const id of Object.keys(TYPE_MAP)) {
      coverage[id] = true;
    }
  }

  // Write to Firebase so all devices can filter their grids reactively
  await set(ref(db, `sessions/${sessionId}/categoryCoverage`), coverage);

  return NextResponse.json({ coverage });
}
