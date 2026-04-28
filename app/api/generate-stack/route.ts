// app/api/generate-stack/route.ts
// V2.2 — Read-filter-sample from pre-built pool, with direct API fallback.
//
// Primary path (pool ready):
//   Reads the pre-built pool from Firebase, applies session-specific filters
//   (distance, open hours, price), runs slot allocation and sampling, fetches
//   full Place Details for the 25 selected restaurants, writes the stack,
//   then deletes the pool node.
//
// Fallback path (pool not ready):
//   Falls back to generateStackDirectly() — the original V2.1 logic that
//   makes live Places API calls inside the function. Used when the pool build
//   chain (p1→p2→p3) hasn't completed before the group reaches generating-stack.
//   Stacks generated via fallback draw from page 1 only (20 results per category).
//
// V2.1 algorithm (weighting, slot allocation, graceful expansion, dietary
// filtering, dedup, photo selection) is unchanged in both paths.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { ref, get, set, remove } from "firebase/database";
import type { StackRestaurant } from "@/lib/types";

// ── Constants ────────────────────────────────────────────────────────────────

const STACK_CEILING = 25;
const EXPANSION_TRIGGER = 10;
const RECOVERY_TRIGGER = 6;

const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const PLACES_BASE = "https://places.googleapis.com/v1/places";
const PHOTO_BASE  = "https://places.googleapis.com/v1";

// Full field mask for the V2.1 direct API path (unchanged)
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

// Place Details field mask for the V2.2 pool path.
// Fetched for the 25 selected restaurants only — not the full pool.
// Includes businessStatus (to catch permanently closed places) and
// currentOpeningHours (for closing time display on swipe cards).
const DETAILS_FIELD_MASK = [
  "businessStatus",
  "formattedAddress",
  "nationalPhoneNumber",
  "websiteUri",
  "currentOpeningHours",
  "editorialSummary",
  "goodForGroups",
  "outdoorSeating",
  "reservable",
  "takeout",
  "delivery",
  "servesBeer",
  "servesWine",
  "servesCocktails",
  "servesVegetarianFood",
  "accessibilityOptions",
].join(",");

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

const PRICE_LEVEL_MAP: Record<string, string[]> = {
  "$":    ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE"],
  "$$":   ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE"],
  "$$$":  ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"],
  "$$$$": ["PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"],
};

const PRICE_TIERS = ["$", "$$", "$$$", "$$$$"] as const;

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

// ── Shared helpers ────────────────────────────────────────────────────────────

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

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function formatClosingTime(nextCloseTime: string): string {
  try {
    const d = new Date(nextCloseTime);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Chicago",
    });
  } catch {
    return "";
  }
}

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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function passesVenueFilter(place: Record<string, unknown>): boolean {
  const types = place.types as string[] | undefined;
  if (!types) return true;
  return !types.some((t) => EXCLUDED_VENUE_TYPES.has(t));
}

function passesQualityFloor(place: Record<string, unknown>): boolean {
  const rating = place.rating as number | undefined;
  const reviews = place.userRatingCount as number | undefined;
  if (rating === undefined || rating === null || rating < 3.8) return false;
  if (reviews === undefined || reviews === null || reviews < 30) return false;
  return true;
}

function isCurrentlyOpen(place: Record<string, unknown>): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hours = place.currentOpeningHours as any;
  if (!hours) return true;
  if (hours.openNow === false) return false;
  return true;
}

function passesPriceFilter(place: Record<string, unknown>, priceLevels: string[]): boolean {
  if (priceLevels.length >= 4) return true;
  const priceEnum = place.priceLevel as string | undefined;
  if (!priceEnum || priceEnum === "PRICE_LEVEL_UNSPECIFIED") return true;
  return priceLevels.includes(priceEnum);
}

function computeDietaryWeight(
  place: Record<string, unknown>,
  restrictions: Set<string>
): number {
  let weight = 1.0;
  const types = (place.types as string[]) || [];
  if (restrictions.has("vegetarian") || restrictions.has("vegan")) {
    const isVegFriendly =
      types.includes("vegetarian_restaurant") || types.includes("vegan_restaurant");
    if (!isVegFriendly) {
      weight *= 0.5;
      if (place.servesVegetarianFood === false) weight *= 0.5;
    }
  }
  if (restrictions.has("vegan") && !types.includes("vegan_restaurant")) weight *= 0.5;
  if (restrictions.has("shellfish") && types.includes("seafood_restaurant")) weight *= 0.5;
  return weight;
}

function getCategorySlotBoost(cuisineId: string, restrictions: Set<string>): number {
  let boost = 1.0;
  if (restrictions.has("halal")) {
    if (["middle-eastern", "indian", "mediterranean"].includes(cuisineId)) boost *= 1.5;
  }
  if (restrictions.has("kosher")) {
    if (["mediterranean", "american"].includes(cuisineId)) boost *= 1.5;
  }
  return boost;
}

interface GooglePhoto { name: string; widthPx?: number; heightPx?: number; }

function selectBestPhotoReference(photos: GooglePhoto[]): string | null {
  if (!photos || photos.length === 0) return null;
  const landscape = photos.filter(
    (p) => p.widthPx && p.heightPx && p.widthPx > p.heightPx
  );
  const pool = landscape.length > 0 ? landscape : photos;
  return pool.reduce((best, p) =>
    (p.widthPx ?? 0) > (best.widthPx ?? 0) ? p : best
  ).name;
}

async function resolvePhoto(photoName: string): Promise<string | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY!;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  try {
    const resp = await fetch(
      `${PHOTO_BASE}/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true&key=${key}`,
      { signal: controller.signal }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.photoUri as string) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function deduplicateByName(
  results: Record<string, Record<string, unknown>[]>,
  sessionLat: number,
  sessionLng: number
): { deduplicated: Record<string, Record<string, unknown>[]>; seenNames: Set<string> } {
  const seenNames = new Set<string>();
  const deduplicated: Record<string, Record<string, unknown>[]> = {};

  for (const [cuisineId, places] of Object.entries(results)) {
    const sorted = [...places].sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const la = (a.location as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lb = (b.location as any);
      // Pool entries use {latitude, longitude}; direct API entries use {latitude, longitude} too
      const aLat = la?.latitude ?? la?.lat;
      const aLng = la?.longitude ?? la?.lng;
      const bLat = lb?.latitude ?? lb?.lat;
      const bLng = lb?.longitude ?? lb?.lng;
      const da = (aLat && aLng) ? haversine(sessionLat, sessionLng, aLat, aLng) : Infinity;
      const db2 = (bLat && bLng) ? haversine(sessionLat, sessionLng, bLat, bLng) : Infinity;
      return da - db2;
    });

    deduplicated[cuisineId] = [];
    for (const place of sorted) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nameObj = place.displayName as any;
      const rawName = nameObj?.text || (typeof nameObj === "string" ? nameObj : "");
      const name = rawName.toLowerCase().trim();
      if (!name) {
        deduplicated[cuisineId].push(place);
        continue;
      }
      if (!seenNames.has(name)) {
        seenNames.add(name);
        deduplicated[cuisineId].push(place);
      }
    }
  }

  return { deduplicated, seenNames };
}

function transformPlace(
  place: Record<string, unknown>,
  cuisineId: string,
  sessionLat: number,
  sessionLng: number,
  photoUrl: string | null,
  photoReferenceName: string | null
): StackRestaurant {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const name = (place.displayName as any)?.text || (place.displayName as string) || "Unknown";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locationObj = place.location as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentHours = place.currentOpeningHours as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorialSummaryObj = place.editorialSummary as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessibilityOpts = place.accessibilityOptions as any;

  // Support both Google's {latitude, longitude} format (pool/details) and
  // any legacy {lat, lng} format
  const placeLat = locationObj?.latitude ?? locationObj?.lat;
  const placeLng = locationObj?.longitude ?? locationObj?.lng;

  const distanceMiles = (placeLat && placeLng)
    ? Math.round(haversine(sessionLat, sessionLng, placeLat, placeLng) * 10) / 10
    : 0;

  const priceLevelEnum = place.priceLevel as string | undefined;
  const priceLevelMap: Record<string, number> = {
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  const priceLevel = priceLevelEnum ? (priceLevelMap[priceLevelEnum] ?? null) : null;

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
    matchCategoryId: cuisineId,
    rating: (place.rating as number) || 0,
    reviewCount: (place.userRatingCount as number) || 0,
    priceLevel,
    photoUrl,
    photoReferenceName,
    address: (place.formattedAddress as string) || "",
    phone: (place.nationalPhoneNumber as string) || null,
    websiteUrl: (place.websiteUri as string) || null,
    distanceMiles,
    location: (placeLat && placeLng)
      ? { lat: placeLat, lng: placeLng }
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

// ── V2.1 direct API path (unchanged, used as fallback) ────────────────────────

async function queryCategory(
  cuisineId: string,
  lat: number,
  lng: number,
  radiusMeters: number,
): Promise<Record<string, unknown>[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY!;
  const placeType = TYPE_MAP[cuisineId];
  if (!placeType) return [];

  const body: Record<string, unknown> = {
    includedTypes: [placeType],
    locationRestriction: {
      circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
    },
    maxResultCount: 20,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const resp = await fetch(NEARBY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await resp.json();
    if (data.error) {
      console.error(`[generate-stack/direct] Places API error for ${cuisineId}:`, JSON.stringify(data.error));
      return [];
    }
    return data.places || [];
  } catch (err) {
    const isTimeout = (err as Error).name === "AbortError";
    console.error(`[generate-stack/direct] queryCategory ${isTimeout ? "timed out" : "failed"} for ${cuisineId}:`, err);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// The original V2.1 generate-stack logic, extracted to a function.
// Called when pool/complete is not set — guarantees a stack is always generated.
async function generateStackDirectly(sessionId: string): Promise<NextResponse> {
  const key = process.env.GOOGLE_PLACES_API_KEY!;
  const sessionRef = ref(db, `sessions/${sessionId}`);

  try {
    const snap = await get(sessionRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = snap.val() as any;
    const participants = session.participants || {};
    const participantCount = Object.keys(participants).length;
    const responses = session.responses || {};
    const preferencesPositive: Record<string, string[]> = responses.preferencesPositive || {};
    const preferencesNegative: Record<string, string[]> = responses.preferencesNegative || {};
    const vetoData: Record<string, string> = responses.veto || {};
    const dietaryData: Record<string, string[]> = responses.dietary || {};
    const location = session.location;

    if (!location?.lat || !location?.lng) {
      await set(ref(db, `sessions/${sessionId}/stack`), { generated: false, error: "no-location" });
      return NextResponse.json({ error: "No location set" }, { status: 422 });
    }

    // Stage 1 — Category resolution
    const negativeTally: Record<string, number> = {};
    for (const picks of Object.values(preferencesNegative)) {
      for (const id of (picks || [])) negativeTally[id] = (negativeTally[id] || 0) + 1;
    }

    const exclusionSet = new Set<string>();
    const majorityThreshold = Math.ceil(participantCount / 2);
    for (const [cuisineId, count] of Object.entries(negativeTally)) {
      if (count >= majorityThreshold) exclusionSet.add(cuisineId);
    }
    for (const vetoValue of Object.values(vetoData)) {
      if (vetoValue && vetoValue !== "pass") exclusionSet.add(vetoValue);
    }

    const positiveTally: Record<string, number> = {};
    for (const picks of Object.values(preferencesPositive)) {
      for (const id of (picks || [])) {
        if (!exclusionSet.has(id)) positiveTally[id] = (positiveTally[id] || 0) + 1;
      }
    }

    const weights: Record<string, number> = {};
    const poolIds = Object.entries(positiveTally).filter(([, c]) => c > 0).map(([id]) => id);

    if (poolIds.length === 0) {
      const NO_PREF_DEFAULTS = ["american", "mexican", "italian", "japanese", "chinese", "thai", "korean", "burgers", "pizza", "fast-food"];
      for (const id of NO_PREF_DEFAULTS) {
        if (!exclusionSet.has(id) && TYPE_MAP[id]) weights[id] = 1;
      }
      if (Object.keys(weights).length < 5) {
        for (const id of Object.keys(TYPE_MAP)) {
          if (!exclusionSet.has(id) && !weights[id]) weights[id] = 1;
          if (Object.keys(weights).length >= 10) break;
        }
      }
    } else {
      for (const id of poolIds) {
        const count = positiveTally[id];
        if (count === participantCount) weights[id] = 3;
        else if (count >= Math.ceil(participantCount / 2)) weights[id] = 2;
        else weights[id] = 1.5;
      }
    }

    const preferencePoolIds = Object.keys(weights);
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const slots: Record<string, number> = {};
    let totalAllocated = 0;
    for (const id of preferencePoolIds) {
      slots[id] = Math.max(1, Math.round((weights[id] / totalWeight) * STACK_CEILING));
      totalAllocated += slots[id];
    }
    const drift = STACK_CEILING - totalAllocated;
    if (drift !== 0 && preferencePoolIds.length > 0) {
      const topId = [...preferencePoolIds].sort((a, b) => weights[b] - weights[a])[0];
      slots[topId] = Math.max(1, slots[topId] + drift);
    }

    // Stage 2 — Distance and price
    const distanceValues = (Object.values(responses.distance || {}) as number[]).filter((v) => typeof v === "number");
    const resolvedMiles = Math.max(1, Math.min(15, median(distanceValues.length > 0 ? distanceValues : [5])));
    const radiusMeters = resolvedMiles * 1609.34;
    const priceVotes = Object.values(responses.price || {}) as string[];
    const resolvedPrice = PRICE_TIERS.find((tier) => priceVotes.includes(tier)) ?? "$$$$";
    const priceLevels = PRICE_LEVEL_MAP[resolvedPrice] || PRICE_LEVEL_MAP["$$$$"];
    const allRestrictions = new Set<string>();
    for (const picks of Object.values(dietaryData)) {
      for (const r of (picks || [])) allRestrictions.add(r);
    }

    // Stage 3 — Live API fetch
    const categoryResults: Record<string, Record<string, unknown>[]> = {};
    await Promise.all(
      preferencePoolIds.map(async (cuisineId) => {
        const raw = await queryCategory(cuisineId, location.lat, location.lng, radiusMeters);
        categoryResults[cuisineId] = raw.filter(
          (p) => passesVenueFilter(p) && passesQualityFloor(p) && isCurrentlyOpen(p) && passesPriceFilter(p, priceLevels)
        );
      })
    );

    let totalQualifying = Object.values(categoryResults).reduce((sum, arr) => sum + arr.length, 0);

    // Stage 4 — Graceful expansion (live API calls)
    const topOffPool: Record<string, unknown>[] = [];
    const expandedCategories = new Set<string>(preferencePoolIds);
    if (totalQualifying < EXPANSION_TRIGGER) {
      const sortedPoolIds = [...preferencePoolIds].sort((a, b) => weights[b] - weights[a]);
      outer:
      for (const originId of sortedPoolIds) {
        for (const targetId of (ADJACENCY[originId] || [])) {
          if (exclusionSet.has(targetId) || expandedCategories.has(targetId)) continue;
          expandedCategories.add(targetId);
          const raw = await queryCategory(targetId, location.lat, location.lng, radiusMeters);
          const filtered = raw.filter(
            (p) => passesVenueFilter(p) && passesQualityFloor(p) && isCurrentlyOpen(p) && passesPriceFilter(p, priceLevels)
          );
          topOffPool.push(...filtered);
          totalQualifying += filtered.length;
          if (totalQualifying >= EXPANSION_TRIGGER) break outer;
        }
      }
    }

    // Stage 4b — Dedup
    const { deduplicated, seenNames: dedupSeenNames } = deduplicateByName(categoryResults, location.lat, location.lng);
    for (const [id, places] of Object.entries(deduplicated)) categoryResults[id] = places;
    const dedupedTopOff = topOffPool.filter((place) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nameObj = place.displayName as any;
      const rawName = nameObj?.text || (typeof nameObj === "string" ? nameObj : "");
      const name = rawName.toLowerCase().trim();
      if (!name) return true;
      if (dedupSeenNames.has(name)) return false;
      dedupSeenNames.add(name);
      return true;
    });
    topOffPool.length = 0;
    topOffPool.push(...dedupedTopOff);
    totalQualifying = Object.values(categoryResults).reduce((sum, arr) => sum + arr.length, 0) + topOffPool.length;

    // Stage 5 — Thin-pool check
    if (totalQualifying < RECOVERY_TRIGGER) {
      await set(ref(db, `sessions/${sessionId}/stack`), { generated: false, error: "thin-pool" });
      return NextResponse.json({ ok: true, thinPool: true });
    }
    const reducedPool = totalQualifying < EXPANSION_TRIGGER;

    // Stage 6 — Dietary filtering
    for (const cuisineId of Object.keys(categoryResults)) {
      categoryResults[cuisineId] = categoryResults[cuisineId].map((place) => ({
        ...place,
        _weight: computeDietaryWeight(place, allRestrictions),
      }));
    }
    const weightedTopOff = topOffPool.map((place) => ({
      ...place,
      _weight: computeDietaryWeight(place, allRestrictions),
      _topOff: true,
    }));

    // Stage 7 — Sampling
    const sampledRestaurants: Array<{ place: Record<string, unknown>; cuisineId: string }> = [];
    for (const cuisineId of preferencePoolIds) {
      const candidates = categoryResults[cuisineId] as Array<Record<string, unknown>>;
      if (!candidates.length) continue;
      const categoryBoost = getCategorySlotBoost(cuisineId, allRestrictions);
      const sampleCount = Math.min(Math.round((slots[cuisineId] || 1) * categoryBoost), candidates.length);
      for (const place of weightedSample(candidates, sampleCount)) {
        sampledRestaurants.push({ place, cuisineId });
      }
    }
    const remainingSlots = STACK_CEILING - sampledRestaurants.length;
    if (remainingSlots > 0 && weightedTopOff.length > 0) {
      for (const place of weightedSample(weightedTopOff as Array<Record<string, unknown>>, remainingSlots)) {
        const types = (place.types as string[]) || [];
        const matchedId = Object.entries(TYPE_MAP).find(([, t]) => types.includes(t))?.[0] || "american";
        sampledRestaurants.push({ place, cuisineId: matchedId });
      }
    }
    const shuffled = shuffle(sampledRestaurants);

    // Stage 8 — Photo resolution
    const PHOTO_CONCURRENCY_CAP = 20;
    const photoRefs = shuffled.map(({ place }) => selectBestPhotoReference((place.photos as GooglePhoto[]) || []));
    const photoResults = await Promise.all(
      photoRefs.map(async (photoName, idx) => {
        if (idx >= PHOTO_CONCURRENCY_CAP || !photoName) return null;
        return resolvePhoto(photoName);
      })
    );

    // Stage 9 — Write stack
    const restaurants: StackRestaurant[] = shuffled.map(({ place, cuisineId }, i) =>
      transformPlace(place, cuisineId, location.lat, location.lng, photoResults[i], photoRefs[i])
    );
    const seenIds = new Set<string>();
    const uniqueRestaurants = restaurants.filter((r) => {
      if (seenIds.has(r.id)) return false;
      seenIds.add(r.id); return true;
    });

    await set(ref(db, `sessions/${sessionId}/stack`), {
      generated: true,
      generatedAt: Date.now(),
      reducedPool,
      restaurants: uniqueRestaurants,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[generate-stack/direct] Fatal error:", err, "sessionId:", sessionId);
    try {
      await set(ref(db, `sessions/${sessionId}/stack`), { generated: false, error: "api-failure" });
    } catch { /* ignore */ }
    return NextResponse.json({ error: "Stack generation failed" }, { status: 500 });
  }
}

// ── V2.2 pool path helpers ────────────────────────────────────────────────────

// Evaluate whether a restaurant is currently open using its regularOpeningHours
// periods, evaluated against the current time in America/Chicago (DFW timezone).
//
// Note: hardcoded to America/Chicago for this prototype. Will need to derive
// timezone from session coordinates when the app expands beyond DFW markets.
//
// Uses regularOpeningHours (the business's set schedule) rather than
// currentOpeningHours.openNow, since openNow in the pool was captured at
// pool build time — potentially hours before generate fires.
function isOpenFromPeriods(
  hours: {
    periods?: Array<{
      open: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }>;
  } | undefined,
  now: Date
): boolean {
  if (!hours?.periods?.length) return true; // unknown schedule → don't exclude

  // Convert UTC time to America/Chicago local time for comparison
  const chicagoTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const day = chicagoTime.getDay();
  const currentMinutes = chicagoTime.getHours() * 60 + chicagoTime.getMinutes();

  for (const period of hours.periods) {
    if (!period.close) {
      // No close time = 24-hour operation
      if (day === period.open.day) return true;
      continue;
    }

    const openMin  = period.open.hour  * 60 + period.open.minute;
    const closeMin = period.close.hour * 60 + period.close.minute;

    if (period.open.day === period.close.day) {
      // Same-day period (e.g., Mon 11am–10pm)
      if (day === period.open.day && currentMinutes >= openMin && currentMinutes < closeMin) {
        return true;
      }
    } else {
      // Overnight period (e.g., Fri 10pm–Sat 2am)
      if (day === period.open.day  && currentMinutes >= openMin)  return true;
      if (day === period.close.day && currentMinutes < closeMin)  return true;
    }
  }

  return false;
}

// Check if a pool entry is within the session's selected distance radius
function withinDistance(
  place: Record<string, unknown>,
  sessionLat: number,
  sessionLng: number,
  maxMiles: number
): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loc = place.location as any;
  const lat = loc?.latitude ?? loc?.lat;
  const lng = loc?.longitude ?? loc?.lng;
  if (!lat || !lng) return true; // unknown location → don't exclude
  return haversine(sessionLat, sessionLng, lat, lng) <= maxMiles;
}

// Fetch full Place Details for a single restaurant (by Google Place ID).
// Used in the pool path to get address, phone, website, and dining attributes
// for the 25 selected restaurants only — not the full pool.
async function fetchPlaceDetails(placeId: string): Promise<Record<string, unknown>> {
  const key = process.env.GOOGLE_PLACES_API_KEY!;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const resp = await fetch(`${PLACES_BASE}/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
      signal: controller.signal,
    });

    if (!resp.ok) return {};
    return await resp.json() as Record<string, unknown>;
  } catch {
    return {}; // Failed details → restaurant still included with null detail fields
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── V2.2 pool path ────────────────────────────────────────────────────────────

async function generateStackFromPool(sessionId: string): Promise<NextResponse> {
  const sessionRef = ref(db, `sessions/${sessionId}`);

  try {
    // ── Read session and pool from Firebase ─────────────────────────────────
    const snap = await get(sessionRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = snap.val() as any;
    const participants = session.participants || {};
    const participantCount = Object.keys(participants).length;
    const responses = session.responses || {};
    const preferencesPositive: Record<string, string[]> = responses.preferencesPositive || {};
    const preferencesNegative: Record<string, string[]> = responses.preferencesNegative || {};
    const vetoData: Record<string, string> = responses.veto || {};
    const dietaryData: Record<string, string[]> = responses.dietary || {};
    const location = session.location;

    if (!location?.lat || !location?.lng) {
      await set(ref(db, `sessions/${sessionId}/stack`), { generated: false, error: "no-location" });
      return NextResponse.json({ error: "No location set" }, { status: 422 });
    }

    // Merge all pool pages per category into flat arrays
    const rawPool = session.pool as Record<string, { p1?: Record<string, unknown>[]; p2?: Record<string, unknown>[]; p3?: Record<string, unknown>[] }> | null;
    const categoryRestaurants: Record<string, Record<string, unknown>[]> = {};

    for (const cuisineId of Object.keys(TYPE_MAP)) {
      const pages = rawPool?.[cuisineId];
      if (!pages) { categoryRestaurants[cuisineId] = []; continue; }
      categoryRestaurants[cuisineId] = [
        ...(Array.isArray(pages.p1) ? pages.p1 : []),
        ...(Array.isArray(pages.p2) ? pages.p2 : []),
        ...(Array.isArray(pages.p3) ? pages.p3 : []),
      ];
    }

    // ── Stage 1 — Category resolution (identical to direct path) ────────────
    const negativeTally: Record<string, number> = {};
    for (const picks of Object.values(preferencesNegative)) {
      for (const id of (picks || [])) negativeTally[id] = (negativeTally[id] || 0) + 1;
    }

    const exclusionSet = new Set<string>();
    const majorityThreshold = Math.ceil(participantCount / 2);
    for (const [cuisineId, count] of Object.entries(negativeTally)) {
      if (count >= majorityThreshold) exclusionSet.add(cuisineId);
    }
    for (const vetoValue of Object.values(vetoData)) {
      if (vetoValue && vetoValue !== "pass") exclusionSet.add(vetoValue);
    }

    const positiveTally: Record<string, number> = {};
    for (const picks of Object.values(preferencesPositive)) {
      for (const id of (picks || [])) {
        if (!exclusionSet.has(id)) positiveTally[id] = (positiveTally[id] || 0) + 1;
      }
    }

    const weights: Record<string, number> = {};
    const poolIds = Object.entries(positiveTally).filter(([, c]) => c > 0).map(([id]) => id);

    if (poolIds.length === 0) {
      const NO_PREF_DEFAULTS = ["american", "mexican", "italian", "japanese", "chinese", "thai", "korean", "burgers", "pizza", "fast-food"];
      for (const id of NO_PREF_DEFAULTS) {
        if (!exclusionSet.has(id) && TYPE_MAP[id]) weights[id] = 1;
      }
      if (Object.keys(weights).length < 5) {
        for (const id of Object.keys(TYPE_MAP)) {
          if (!exclusionSet.has(id) && !weights[id]) weights[id] = 1;
          if (Object.keys(weights).length >= 10) break;
        }
      }
    } else {
      for (const id of poolIds) {
        const count = positiveTally[id];
        if (count === participantCount) weights[id] = 3;
        else if (count >= Math.ceil(participantCount / 2)) weights[id] = 2;
        else weights[id] = 1.5;
      }
    }

    const preferencePoolIds = Object.keys(weights);
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const slots: Record<string, number> = {};
    let totalAllocated = 0;
    for (const id of preferencePoolIds) {
      slots[id] = Math.max(1, Math.round((weights[id] / totalWeight) * STACK_CEILING));
      totalAllocated += slots[id];
    }
    const drift = STACK_CEILING - totalAllocated;
    if (drift !== 0 && preferencePoolIds.length > 0) {
      const topId = [...preferencePoolIds].sort((a, b) => weights[b] - weights[a])[0];
      slots[topId] = Math.max(1, slots[topId] + drift);
    }

    // ── Stage 2 — Distance and price resolution ──────────────────────────────
    const distanceValues = (Object.values(responses.distance || {}) as number[]).filter((v) => typeof v === "number");
    const resolvedMiles = Math.max(1, Math.min(15, median(distanceValues.length > 0 ? distanceValues : [5])));
    const priceVotes = Object.values(responses.price || {}) as string[];
    const resolvedPrice = PRICE_TIERS.find((tier) => priceVotes.includes(tier)) ?? "$$$$";
    const priceLevels = PRICE_LEVEL_MAP[resolvedPrice] || PRICE_LEVEL_MAP["$$$$"];
    const allRestrictions = new Set<string>();
    for (const picks of Object.values(dietaryData)) {
      for (const r of (picks || [])) allRestrictions.add(r);
    }

    // ── Stage 3 — Apply session-specific filters to pool ────────────────────
    // Pool entries already passed venue filter and quality floor during build.
    // Apply the session-specific filters here: distance, open hours, price.
    // Venue filter is re-applied as a safety net (pool build should have caught these).
    const now = new Date();
    const categoryResults: Record<string, Record<string, unknown>[]> = {};

    for (const cuisineId of preferencePoolIds) {
      categoryResults[cuisineId] = (categoryRestaurants[cuisineId] || []).filter(
        (p) =>
          passesVenueFilter(p) &&
          withinDistance(p, location.lat, location.lng, resolvedMiles) &&
          isOpenFromPeriods(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (p.regularOpeningHours as any),
            now
          ) &&
          passesPriceFilter(p, priceLevels)
      );
    }

    let totalQualifying = Object.values(categoryResults).reduce((sum, arr) => sum + arr.length, 0);

    // ── Stage 4 — Graceful expansion (from pool — no API calls needed) ───────
    // All 22 categories are already in the pool. Expansion simply applies the
    // same session filters to adjacent categories already present in the pool.
    const topOffPool: Record<string, unknown>[] = [];
    const expandedCategories = new Set<string>(preferencePoolIds);

    if (totalQualifying < EXPANSION_TRIGGER) {
      const sortedPoolIds = [...preferencePoolIds].sort((a, b) => weights[b] - weights[a]);

      outer:
      for (const originId of sortedPoolIds) {
        for (const targetId of (ADJACENCY[originId] || [])) {
          if (exclusionSet.has(targetId) || expandedCategories.has(targetId)) continue;
          expandedCategories.add(targetId);

          const filtered = (categoryRestaurants[targetId] || []).filter(
            (p) =>
              passesVenueFilter(p) &&
              withinDistance(p, location.lat, location.lng, resolvedMiles) &&
              isOpenFromPeriods(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (p.regularOpeningHours as any),
                now
              ) &&
              passesPriceFilter(p, priceLevels)
          );

          topOffPool.push(...filtered);
          totalQualifying += filtered.length;
          if (totalQualifying >= EXPANSION_TRIGGER) break outer;
        }
      }
    }

    // ── Stage 4b — Name deduplication ───────────────────────────────────────
    const { deduplicated, seenNames: dedupSeenNames } = deduplicateByName(categoryResults, location.lat, location.lng);
    for (const [id, places] of Object.entries(deduplicated)) categoryResults[id] = places;

    const dedupedTopOff = topOffPool.filter((place) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nameObj = place.displayName as any;
      const rawName = nameObj?.text || (typeof nameObj === "string" ? nameObj : "");
      const name = rawName.toLowerCase().trim();
      if (!name) return true;
      if (dedupSeenNames.has(name)) return false;
      dedupSeenNames.add(name);
      return true;
    });
    topOffPool.length = 0;
    topOffPool.push(...dedupedTopOff);

    totalQualifying = Object.values(categoryResults).reduce((sum, arr) => sum + arr.length, 0) + topOffPool.length;

    // ── Stage 5 — Thin-pool check ────────────────────────────────────────────
    if (totalQualifying < RECOVERY_TRIGGER) {
      await set(ref(db, `sessions/${sessionId}/stack`), { generated: false, error: "thin-pool" });
      await remove(ref(db, `sessions/${sessionId}/pool`));
      return NextResponse.json({ ok: true, thinPool: true });
    }
    const reducedPool = totalQualifying < EXPANSION_TRIGGER;

    // ── Stage 6 — Dietary soft-filtering ────────────────────────────────────
    for (const cuisineId of Object.keys(categoryResults)) {
      categoryResults[cuisineId] = categoryResults[cuisineId].map((place) => ({
        ...place,
        _weight: computeDietaryWeight(place, allRestrictions),
      }));
    }
    const weightedTopOff = topOffPool.map((place) => ({
      ...place,
      _weight: computeDietaryWeight(place, allRestrictions),
      _topOff: true,
    }));

    // ── Stage 7 — Sampling ───────────────────────────────────────────────────
    const sampledRestaurants: Array<{ place: Record<string, unknown>; cuisineId: string }> = [];
    for (const cuisineId of preferencePoolIds) {
      const candidates = categoryResults[cuisineId] as Array<Record<string, unknown>>;
      if (!candidates.length) continue;
      const categoryBoost = getCategorySlotBoost(cuisineId, allRestrictions);
      const sampleCount = Math.min(Math.round((slots[cuisineId] || 1) * categoryBoost), candidates.length);
      for (const place of weightedSample(candidates, sampleCount)) {
        sampledRestaurants.push({ place, cuisineId });
      }
    }
    const remainingSlots = STACK_CEILING - sampledRestaurants.length;
    if (remainingSlots > 0 && weightedTopOff.length > 0) {
      for (const place of weightedSample(weightedTopOff as Array<Record<string, unknown>>, remainingSlots)) {
        const types = (place.types as string[]) || [];
        const matchedId = Object.entries(TYPE_MAP).find(([, t]) => types.includes(t))?.[0] || "american";
        sampledRestaurants.push({ place, cuisineId: matchedId });
      }
    }
    const shuffled = shuffle(sampledRestaurants);

    // ── Stage 8 — Fetch Place Details + resolve photos for 25 restaurants ───
    // Fetches full details (address, phone, website, dining attributes) for
    // only the selected 25. All 25 detail calls run in parallel alongside
    // photo resolution. Photo cap of 20 is preserved — fill-photos handles
    // the remaining 5.
    const PHOTO_CONCURRENCY_CAP = 20;

    const detailsAndPhotos = await Promise.all(
      shuffled.map(async ({ place }, idx) => {
        const placeId = place.id as string;

        // Fetch Place Details (parallel across all 25)
        const details = await fetchPlaceDetails(placeId);

        // Resolve photo (capped at first 20)
        const photos = (place.photos as GooglePhoto[]) || [];
        const photoRef = selectBestPhotoReference(photos);
        let photoUrl: string | null = null;
        if (idx < PHOTO_CONCURRENCY_CAP && photoRef) {
          photoUrl = await resolvePhoto(photoRef);
        }

        return { details, photoRef, photoUrl };
      })
    );

    // ── Stage 9 — Build stack and write to Firebase ──────────────────────────
    const restaurants: StackRestaurant[] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < shuffled.length; i++) {
      const { place, cuisineId } = shuffled[i];
      const { details, photoRef, photoUrl } = detailsAndPhotos[i];

      // Skip permanently closed restaurants (substitution handled by dedup pass above)
      if ((details.businessStatus as string) === "CLOSED_PERMANENTLY") {
        console.log(`[generate-stack/pool] Skipping permanently closed: ${(place.displayName as { text?: string })?.text}`);
        continue;
      }

      // Deduplicate by place ID
      const placeId = place.id as string;
      if (seenIds.has(placeId)) continue;
      seenIds.add(placeId);

      // Merge pool data with details data and transform to StackRestaurant
      const merged = { ...place, ...details };
      restaurants.push(
        transformPlace(merged, cuisineId, location.lat, location.lng, photoUrl, photoRef)
      );
    }

    // Write stack to Firebase
    await set(ref(db, `sessions/${sessionId}/stack`), {
      generated: true,
      generatedAt: Date.now(),
      reducedPool,
      restaurants,
    });

    // Delete pool — no longer needed once the stack is written
    await remove(ref(db, `sessions/${sessionId}/pool`));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[generate-stack/pool] Fatal error:", err, "sessionId:", sessionId);
    try {
      await set(ref(db, `sessions/${sessionId}/stack`), { generated: false, error: "api-failure" });
    } catch { /* ignore */ }
    return NextResponse.json({ error: "Stack generation failed" }, { status: 500 });
  }
}

// ── Main route handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY;

  const body = await req.json() as { sessionId?: string };
  const sessionId = body.sessionId;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  if (!key) {
    await set(ref(db, `sessions/${sessionId}/stack`), { generated: false, error: "api-failure" });
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  // Check whether the pre-built pool is ready
  const poolCompleteSnap = await get(ref(db, `sessions/${sessionId}/pool/complete`));

  if (!poolCompleteSnap.val()) {
    // Pool not ready — use direct API approach (V2.1 fallback)
    console.log(`[generate-stack] pool not ready — using direct fallback for session ${sessionId}`);
    return generateStackDirectly(sessionId);
  }

  // Pool ready — use read-filter-sample approach (V2.2 primary path)
  return generateStackFromPool(sessionId);
}
