// app/api/generate-stack/route.ts
// The core of V2.0. Called by the creator's device when the session enters
// generating-stack phase. Runs the full 9-stage stack generation algorithm,
// writes the result to Firebase, and returns. The client watches Firebase
// for stack/generated: true and advances the phase itself.
//
// Algorithm overview:
//   Stage 1 — Category resolution (negative tally, exclusion set, preference pool,
//              weight assignment, slot allocation)
//   Stage 2 — Restaurant fetch (Places Nearby Search, parallel per category)
//   Stage 3 — Quality floor (4.0 rating / 50 reviews)
//   Stage 4 — Open-hours filter (exclude if currentOpeningHours.openNow === false)
//   Stage 5 — Graceful expansion (adjacency table walk if pool < 10)
//   Stage 6 — Dietary soft-filtering (type-array and category-proxy weights)
//   Stage 7 — Sampling (weighted per category, merge, shuffle)
//   Stage 8 — Photo resolution (skipHttpRedirect CDN URL)
//   Stage 9 — Firebase write

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { ref, get, set } from "firebase/database";
import type { StackRestaurant } from "@/lib/types";

// ── Constants ────────────────────────────────────────────────────────────────

const STACK_CEILING = 25;
const EXPANSION_TRIGGER = 10;   // below this → graceful expansion
const RECOVERY_TRIGGER = 6;     // below this after expansion → thin-pool error

const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const PHOTO_BASE = "https://places.googleapis.com/v1";

// Full field mask for restaurant queries
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.types",
  "places.photos",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.location",
  "places.regularOpeningHours",
  "places.currentOpeningHours",
  "places.editorialSummary",
  "places.goodForGroups",
  "places.outdoorSeating",
  "places.reservable",
  "places.takeout",
  "places.delivery",
  "places.servesBeer",
  "places.servesWine",
  "places.servesCocktails",
  "places.servesVegetarianFood",
  "places.accessibilityOptions",
].join(",");

// Match category ID → Google Places type
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

// Match category ID → human label (for matchCategory field)
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

// Graceful expansion adjacency table (from phase-2-design-notes.md)
const ADJACENCY: Record<string, string[]> = {
  "american":       ["burgers", "bbq", "pizza", "italian"],
  "italian":        ["mediterranean", "french", "pizza", "spanish"],
  "mexican":        ["latin-american", "caribbean", "spanish", "american"],
  "chinese":        ["japanese", "vietnamese", "korean", "thai"],
  "japanese":       ["korean", "chinese", "vietnamese", "thai"],
  "indian":         ["middle-eastern", "thai", "mediterranean"],
  "thai":           ["vietnamese", "indian", "chinese", "korean"],
  "korean":         ["japanese", "chinese", "vietnamese"],
  "mediterranean":  ["middle-eastern", "italian", "spanish", "french"],
  "vietnamese":     ["thai", "chinese", "japanese", "korean"],
  "seafood":        ["japanese", "mediterranean", "french", "american"],
  "french":         ["italian", "mediterranean", "spanish", "american"],
  "pizza":          ["italian", "american", "burgers"],
  "burgers":        ["american", "bbq", "pizza"],
  "bbq":            ["american", "burgers", "korean"],
  "fast-food":      ["burgers", "american", "pizza"],
  "middle-eastern": ["mediterranean", "indian", "ethiopian"],
  "ethiopian":      ["middle-eastern", "mediterranean"],
  "filipino":       ["chinese", "japanese", "american", "vietnamese"],
  "caribbean":      ["latin-american", "mexican", "american"],
  "latin-american": ["mexican", "caribbean", "spanish"],
  "spanish":        ["mediterranean", "italian", "french", "latin-american"],
};

// Price tier → Google Places API enum values (ceiling model)
const PRICE_LEVEL_MAP: Record<string, string[]> = {
  "$":    ["PRICE_LEVEL_INEXPENSIVE"],
  "$$":   ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE"],
  "$$$":  ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE"],
  "$$$$": ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"],
};

const PRICE_TIERS = ["$", "$$", "$$$", "$$$$"] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Haversine formula — straight-line distance between two lat/lng points, in miles
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Median of a number array
function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// Parse a closing time string (RFC 3339 / ISO format) to "10:00 PM"
function formatClosingTime(nextCloseTime: string): string {
  try {
    const d = new Date(nextCloseTime);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Chicago", // Dallas — in production, use session location's TZ
    });
  } catch {
    return "";
  }
}

// Weighted random sampling without replacement
function weightedSample<T extends { _weight?: number }>(
  candidates: T[],
  count: number
): T[] {
  if (candidates.length <= count) return [...candidates];

  const pool = candidates.map((c) => ({ item: c, w: c._weight ?? 1 }));
  const result: T[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let rand = Math.random() * total;
    let idx = 0;
    for (let j = 0; j < pool.length; j++) {
      rand -= pool[j].w;
      if (rand <= 0) { idx = j; break; }
    }
    result.push(pool[idx].item);
    pool.splice(idx, 1);
  }

  return result;
}

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Google Places API calls ───────────────────────────────────────────────────

// Query one category, paginating until we have enough results for good sampling headroom.
// Returns raw Google Places results (not yet filtered or transformed).
async function queryCategory(
  cuisineId: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  priceLevels: string[],
  slotsNeeded: number
): Promise<Record<string, unknown>[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY!;
  const placeType = TYPE_MAP[cuisineId];
  if (!placeType) return [];

  const target = Math.max(slotsNeeded * 3, 20); // collect 3× slots for sampling headroom
  const results: Record<string, unknown>[] = [];
  let pageToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      includedTypes: [placeType],
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters,
        },
      },
      maxResultCount: 20,
    };

    // Apply price filter only if not the most permissive level
    if (priceLevels.length < 4) {
      body.includedPriceLevels = priceLevels;
    }

    if (pageToken) {
      body.pageToken = pageToken;
    }

    const resp = await fetch(NEARBY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();

    if (data.error) {
      console.error(`[generate-stack] Places API error for ${cuisineId}:`, data.error);
      break;
    }

    results.push(...(data.places || []));
    pageToken = data.nextPageToken;

    // Stop if we have enough
    if (results.length >= target) break;

    // Google requires a brief pause before the next page token is usable
    if (pageToken) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  } while (pageToken);

  return results;
}

// ── Quality and availability filters ─────────────────────────────────────────

function passesQualityFloor(place: Record<string, unknown>): boolean {
  const rating = place.rating as number | undefined;
  const reviews = place.userRatingCount as number | undefined;
  if (rating === undefined || rating === null) return false;
  if (rating < 4.0) return false;
  if (reviews === undefined || reviews === null) return false;
  if (reviews < 50) return false;
  return true;
}

function isCurrentlyOpen(place: Record<string, unknown>): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hours = place.currentOpeningHours as any;
  if (!hours) return true; // unknown → don't exclude
  if (hours.openNow === false) return false;
  return true;
}

// ── Dietary soft-filtering weight ─────────────────────────────────────────────

function computeDietaryWeight(
  place: Record<string, unknown>,
  restrictions: Set<string>
): number {
  let weight = 1.0;
  const types = (place.types as string[]) || [];

  // Tier 1 — types-array signals
  if (restrictions.has("vegetarian") || restrictions.has("vegan")) {
    const isVegFriendly =
      types.includes("vegetarian_restaurant") || types.includes("vegan_restaurant");

    if (!isVegFriendly) {
      weight *= 0.5;
      // Supplementary: servesVegetarianFood === false adds another 0.5×
      if (place.servesVegetarianFood === false) {
        weight *= 0.5;
      }
    }
  }

  if (restrictions.has("vegan") && !types.includes("vegan_restaurant")) {
    weight *= 0.5;
  }

  if (restrictions.has("shellfish") && types.includes("seafood_restaurant")) {
    weight *= 0.5;
  }

  return weight;
}

// Tier 2 — category-level slot weight boost (applied at sampling, not per-restaurant)
function getCategorySlotBoost(cuisineId: string, restrictions: Set<string>): number {
  let boost = 1.0;

  if (restrictions.has("halal")) {
    if (["middle-eastern", "indian", "mediterranean"].includes(cuisineId)) {
      boost *= 1.5;
    }
  }

  if (restrictions.has("kosher")) {
    if (["mediterranean", "american"].includes(cuisineId)) {
      boost *= 1.5;
    }
  }

  return boost;
}

// ── Photo resolution ──────────────────────────────────────────────────────────

async function resolvePhoto(photoName: string): Promise<string | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY!;
  try {
    const resp = await fetch(
      `${PHOTO_BASE}/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true&key=${key}`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.photoUri as string) || null;
  } catch {
    return null;
  }
}

// ── Transform raw Places result → StackRestaurant ────────────────────────────

function transformPlace(
  place: Record<string, unknown>,
  cuisineId: string,
  sessionLat: number,
  sessionLng: number,
  photoUrl: string | null
): StackRestaurant {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const name = (place.displayName as any)?.text || (place.displayName as string) || "Unknown";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const location = place.location as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentHours = place.currentOpeningHours as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorialSummaryObj = place.editorialSummary as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessibilityOpts = place.accessibilityOptions as any;

  const distanceMiles = location
    ? Math.round(haversine(sessionLat, sessionLng, location.latitude, location.longitude) * 10) / 10
    : 0;

  // Map Google's enum price level to integer 1-4
  const priceLevelEnum = place.priceLevel as string | undefined;
  const priceLevelMap: Record<string, number> = {
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  const priceLevel = priceLevelEnum ? (priceLevelMap[priceLevelEnum] ?? null) : null;

  // Closing time: from currentOpeningHours.nextCloseTime if open now
  let closingTime: string | null = null;
  if (currentHours?.openNow === true && currentHours?.nextCloseTime) {
    closingTime = formatClosingTime(currentHours.nextCloseTime);
  }

  const servesBeer = place.servesBeer as boolean | undefined;
  const servesWine = place.servesWine as boolean | undefined;
  const servesCocktails = place.servesCocktails as boolean | undefined;
  const servesDrinks =
    servesBeer === true || servesWine === true || servesCocktails === true
      ? true
      : servesBeer === undefined && servesWine === undefined && servesCocktails === undefined
      ? null
      : false;

  return {
    id: place.id as string,
    name,
    matchCategory: CATEGORY_LABELS[cuisineId] || cuisineId,
    rating: (place.rating as number) || 0,
    reviewCount: (place.userRatingCount as number) || 0,
    priceLevel,
    photoUrl,
    address: (place.formattedAddress as string) || "",
    phone: (place.nationalPhoneNumber as string) || null,
    websiteUrl: (place.websiteUri as string) || null,
    distanceMiles,
    location: location
      ? { lat: location.latitude as number, lng: location.longitude as number }
      : { lat: sessionLat, lng: sessionLng },
    editorialSummary: editorialSummaryObj?.text || null,
    closingTime,
    isOpenNow: currentHours?.openNow ?? null,
    goodForGroups: (place.goodForGroups as boolean) ?? null,
    outdoorSeating: (place.outdoorSeating as boolean) ?? null,
    reservable: (place.reservable as boolean) ?? null,
    takeout: (place.takeout as boolean) ?? null,
    delivery: (place.delivery as boolean) ?? null,
    servesDrinks,
    wheelchairAccessible: accessibilityOpts?.wheelchairAccessibleEntrance ?? null,
  };
}

// ── Main route handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY;

  // Read sessionId first so we can write an error to Firebase even if the key is missing
  const body = await req.json() as { sessionId?: string };
  const sessionId = body.sessionId;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const sessionRef = ref(db, `sessions/${sessionId}`);

  if (!key) {
    // Write api-failure so GeneratingStackScreen surfaces the error state instead of hanging
    await set(ref(db, `sessions/${sessionId}/stack`), {
      generated: false,
      error: "api-failure",
    });
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    // ── Read session from Firebase ──────────────────────────────────────────
    const snap = await get(sessionRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = snap.val() as any;
    const participants = session.participants || {};
    const allIds = Object.keys(participants);
    const participantCount = allIds.length;

    const responses = session.responses || {};
    const preferencesPositive: Record<string, string[]> = responses.preferencesPositive || {};
    const preferencesNegative: Record<string, string[]> = responses.preferencesNegative || {};
    const vetoData: Record<string, string> = responses.veto || {};
    const dietaryData: Record<string, string[]> = responses.dietary || {};
    const location = session.location;

    if (!location?.lat || !location?.lng) {
      await set(ref(db, `sessions/${sessionId}/stack`), {
        generated: false,
        error: "no-location",
      });
      return NextResponse.json({ error: "No location set" }, { status: 422 });
    }

    // ── Stage 1 — Category resolution ──────────────────────────────────────

    // 1.1 Tally negative signal
    const negativeTally: Record<string, number> = {};
    for (const picks of Object.values(preferencesNegative)) {
      for (const id of (picks || [])) {
        negativeTally[id] = (negativeTally[id] || 0) + 1;
      }
    }

    // 1.2 Build exclusion set (majority-negative + vetoed)
    const exclusionSet = new Set<string>();
    const majorityThreshold = Math.ceil(participantCount / 2);
    for (const [cuisineId, count] of Object.entries(negativeTally)) {
      if (count >= majorityThreshold) exclusionSet.add(cuisineId);
    }
    for (const vetoValue of Object.values(vetoData)) {
      if (vetoValue && vetoValue !== "pass") exclusionSet.add(vetoValue);
    }

    // 1.3 Tally positive picks (only non-excluded categories)
    const positiveTally: Record<string, number> = {};
    for (const picks of Object.values(preferencesPositive)) {
      for (const id of (picks || [])) {
        if (!exclusionSet.has(id)) {
          positiveTally[id] = (positiveTally[id] || 0) + 1;
        }
      }
    }

    // 1.4 Assign weights — fall back to all non-excluded if pool is empty
    const weights: Record<string, number> = {};
    const poolIds = Object.entries(positiveTally)
      .filter(([, count]) => count > 0)
      .map(([id]) => id);

    if (poolIds.length === 0) {
      // Edge case: every positively-picked category was excluded
      // Fall back to full non-excluded set at 1× weight
      for (const id of Object.keys(TYPE_MAP)) {
        if (!exclusionSet.has(id)) weights[id] = 1;
      }
    } else {
      for (const id of poolIds) {
        const count = positiveTally[id];
        if (count === participantCount) {
          weights[id] = 3;                                             // unanimous
        } else if (count >= Math.ceil(participantCount / 2)) {
          weights[id] = 2;                                             // majority
        } else {
          weights[id] = 1.5;                                           // minority
        }
      }
    }

    const preferencePoolIds = Object.keys(weights);

    // 1.5 Allocate stack slots proportionally
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const slots: Record<string, number> = {};
    let totalAllocated = 0;

    for (const id of preferencePoolIds) {
      slots[id] = Math.max(1, Math.round((weights[id] / totalWeight) * STACK_CEILING));
      totalAllocated += slots[id];
    }

    // Correct rounding drift by adjusting the highest-weight category
    const drift = STACK_CEILING - totalAllocated;
    if (drift !== 0 && preferencePoolIds.length > 0) {
      const topId = [...preferencePoolIds].sort((a, b) => weights[b] - weights[a])[0];
      slots[topId] = Math.max(1, slots[topId] + drift);
    }

    // ── Stage 2 — Distance and price resolution ─────────────────────────────

    const distanceResponses = responses.distance || {};
    const distanceValues = (Object.values(distanceResponses) as number[]).filter(
      (v) => typeof v === "number"
    );
    const resolvedMiles = Math.max(1, Math.min(15, median(distanceValues.length > 0 ? distanceValues : [5])));
    const radiusMeters = resolvedMiles * 1609.34;

    const priceResponses = responses.price || {};
    const priceVotes = Object.values(priceResponses) as string[];
    // Tiebreaker: lowest (cheapest) tier that anyone voted for (matches PriceScreen logic)
    const resolvedPrice = PRICE_TIERS.find((tier) => priceVotes.includes(tier)) ?? "$$$$";
    const priceLevels = PRICE_LEVEL_MAP[resolvedPrice] || PRICE_LEVEL_MAP["$$$$"];

    // Union of all dietary restrictions across the group
    const allRestrictions = new Set<string>();
    for (const picks of Object.values(dietaryData)) {
      for (const r of (picks || [])) allRestrictions.add(r);
    }

    // ── Stage 3 — Fetch restaurants for all preference pool categories ───────

    const categoryResults: Record<string, Record<string, unknown>[]> = {};

    await Promise.all(
      preferencePoolIds.map(async (cuisineId) => {
        const raw = await queryCategory(
          cuisineId,
          location.lat,
          location.lng,
          radiusMeters,
          priceLevels,
          slots[cuisineId] || 1
        );
        // Apply quality floor and open-hours filter
        categoryResults[cuisineId] = raw.filter(
          (p) => passesQualityFloor(p) && isCurrentlyOpen(p)
        );
      })
    );

    // Count total qualifying restaurants in the preference pool
    let totalQualifying = Object.values(categoryResults).reduce(
      (sum, arr) => sum + arr.length,
      0
    );

    // ── Stage 4 — Graceful expansion if needed ───────────────────────────────

    const topOffPool: Record<string, unknown>[] = [];
    const expandedCategories = new Set<string>(preferencePoolIds);

    if (totalQualifying < EXPANSION_TRIGGER) {
      // Walk adjacency table for each preference pool category, highest weight first
      const sortedPoolIds = [...preferencePoolIds].sort((a, b) => weights[b] - weights[a]);

      outer:
      for (const originId of sortedPoolIds) {
        const targets = ADJACENCY[originId] || [];
        for (const targetId of targets) {
          // Skip if excluded or already in the pool
          if (exclusionSet.has(targetId)) continue;
          if (expandedCategories.has(targetId)) continue;

          expandedCategories.add(targetId);

          const raw = await queryCategory(
            targetId,
            location.lat,
            location.lng,
            radiusMeters,
            priceLevels,
            EXPANSION_TRIGGER
          );
          const filtered = raw.filter(
            (p) => passesQualityFloor(p) && isCurrentlyOpen(p)
          );
          topOffPool.push(...filtered);
          totalQualifying += filtered.length;

          // Stop expanding once we have enough
          if (totalQualifying >= EXPANSION_TRIGGER) break outer;
        }
      }
    }

    // ── Stage 5 — Thin-pool check ─────────────────────────────────────────

    const combinedTotal = totalQualifying;
    if (combinedTotal < RECOVERY_TRIGGER) {
      await set(ref(db, `sessions/${sessionId}/stack`), {
        generated: false,
        error: "thin-pool",
      });
      return NextResponse.json({ ok: true, thinPool: true });
    }

    const reducedPool = combinedTotal < EXPANSION_TRIGGER;

    // ── Stage 6 — Dietary soft-filtering ──────────────────────────────────

    // Apply per-restaurant dietary weight to all preference pool results
    for (const cuisineId of Object.keys(categoryResults)) {
      categoryResults[cuisineId] = categoryResults[cuisineId].map((place) => ({
        ...place,
        _weight: computeDietaryWeight(place as Record<string, unknown>, allRestrictions),
      }));
    }

    // Mark top-off pool restaurants (no preference weight)
    const weightedTopOff = topOffPool.map((place) => ({
      ...place,
      _weight: computeDietaryWeight(place as Record<string, unknown>, allRestrictions),
      _topOff: true,
    }));

    // ── Stage 7 — Sampling ─────────────────────────────────────────────────

    const sampledRestaurants: Array<{ place: Record<string, unknown>; cuisineId: string }> = [];

    // Sample from each preference pool category, adjusted for Tier 2 boosts
    for (const cuisineId of preferencePoolIds) {
      const candidates = categoryResults[cuisineId] as Array<Record<string, unknown>>;
      if (!candidates.length) continue;

      const categoryBoost = getCategorySlotBoost(cuisineId, allRestrictions);
      const baseSlots = slots[cuisineId] || 1;
      const adjustedSlots = Math.round(baseSlots * categoryBoost);
      const sampleCount = Math.min(adjustedSlots, candidates.length);

      const picked = weightedSample(candidates, sampleCount);
      for (const place of picked) {
        sampledRestaurants.push({ place, cuisineId });
      }
    }

    // Fill any remaining slots with top-off pool
    const remainingSlots = STACK_CEILING - sampledRestaurants.length;
    if (remainingSlots > 0 && weightedTopOff.length > 0) {
      // Determine the category for each top-off restaurant by checking its types
      const topOffPicked = weightedSample(
        weightedTopOff as Array<Record<string, unknown>>,
        remainingSlots
      );
      for (const place of topOffPicked) {
        // Find the best-matching cuisine ID for the top-off restaurant
        const types = (place.types as string[]) || [];
        const matchedId = Object.entries(TYPE_MAP).find(([, t]) => types.includes(t))?.[0] || "american";
        sampledRestaurants.push({ place, cuisineId: matchedId });
      }
    }

    // Shuffle so participants can't infer category order
    const shuffled = shuffle(sampledRestaurants);

    // ── Stage 8 — Resolve photos ──────────────────────────────────────────

    const photoResults = await Promise.all(
      shuffled.map(async ({ place }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const photos = place.photos as any[];
        if (!photos?.length) return null;
        const photoName = photos[0].name as string;
        if (!photoName) return null;
        return resolvePhoto(photoName);
      })
    );

    // ── Stage 9 — Build final restaurant objects and write to Firebase ─────

    const restaurants: StackRestaurant[] = shuffled.map(({ place, cuisineId }, i) => {
      return transformPlace(
        place,
        cuisineId,
        location.lat,
        location.lng,
        photoResults[i]
      );
    });

    // Deduplicate by place ID (a restaurant may appear via multiple category queries)
    const seenIds = new Set<string>();
    const uniqueRestaurants = restaurants.filter((r) => {
      if (seenIds.has(r.id)) return false;
      seenIds.add(r.id);
      return true;
    });

    await set(ref(db, `sessions/${sessionId}/stack`), {
      generated: true,
      generatedAt: Date.now(),
      reducedPool,
      restaurants: uniqueRestaurants,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[generate-stack] Fatal error:", err, "sessionId:", sessionId);
    // Write api-failure so the client surfaces a graceful message
    try {
      await set(ref(db, `sessions/${sessionId}/stack`), {
        generated: false,
        error: "api-failure",
      });
    } catch {
      // ignore secondary failure
    }
    return NextResponse.json({ error: "Stack generation failed" }, { status: 500 });
  }
}
