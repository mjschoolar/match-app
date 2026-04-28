// lib/types.ts
// Shared TypeScript types that match the data model in CLAUDE.md.

export interface Participant {
  name: string;
  joinedAt: number;
}

// ── V2.2: raw restaurant entry stored in the pre-built pool ─────────────────
// Pool entries use Google Places API field names (latitude/longitude, not lat/lng).
// They carry only the fields needed for filtering, sampling, and photo selection.
// Full details are fetched at generate time for the 25 selected restaurants only.
export interface PoolRestaurant {
  id: string;
  displayName: { text: string } | string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;                    // e.g. "PRICE_LEVEL_MODERATE"
  types?: string[];
  location?: { latitude: number; longitude: number };
  regularOpeningHours?: {
    periods?: Array<{
      open: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }>;
    openNow?: boolean;
    utcOffsetMinutes?: number;
  };
  photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
}

// ── V2.0: real restaurant from Google Places, stored in Firebase stack ──────
export interface StackRestaurant {
  id: string;                       // Google Places place ID
  name: string;
  matchCategory: string;            // Match cuisine label (e.g. "Japanese")
  matchCategoryId: string;          // Match cuisine ID (e.g. "japanese") — used for hero image path
  rating: number;
  reviewCount: number;
  priceLevel: number | null;        // 1–4, or null if not set
  photoUrl: string | null;          // Resolved CDN URL from photo media endpoint
  photoReferenceName: string | null; // Google Places photo resource name — for fill-photos retry
  address: string;
  phone: string | null;
  websiteUrl: string | null;
  distanceMiles: number;
  location: { lat: number; lng: number };
  editorialSummary: string | null;
  closingTime: string | null;       // e.g. "10:00 PM" — derived from currentOpeningHours
  isOpenNow: boolean | null;
  goodForGroups: boolean | null;
  outdoorSeating: boolean | null;
  reservable: boolean | null;
  takeout: boolean | null;
  delivery: boolean | null;
  servesDrinks: boolean | null;     // true if any of beer/wine/cocktails is true
  wheelchairAccessible: boolean | null;
}

// ── Match result written to Firebase after swipe completes ──────────────────
// Includes all fields needed to render the summary screen + action layer.
export interface RestaurantResult {
  id: string;
  name: string;
  cuisine: string;                  // matchCategory at swipe time
  rating: number;
  reviewCount: number;
  priceLevel: number | null;
  distance: string;                 // e.g. "1.4 mi"
  photoUrl: string | null;
  address: string;
  phone: string | null;
  websiteUrl: string | null;
  location: { lat: number; lng: number } | null;
  matchedBy: string[];
}

// ── Full session object ──────────────────────────────────────────────────────
export interface Session {
  phase: string;
  creatorId: string;
  createdAt: number;
  participants: Record<string, Participant>;

  // V2.0: location captured at session creation
  location?: {
    lat: number;
    lng: number;
    source: "gps" | "manual";
    label: string;
  };

  // V2.0: generated restaurant stack
  stack?: {
    generated: boolean;
    generatedAt?: number;
    reducedPool?: boolean;
    error?: string;               // "thin-pool" | "api-failure"
    restaurants?: StackRestaurant[] | Record<string, StackRestaurant>;
    photosFilled?: boolean;       // V2.1: set to true by fill-photos route when complete
  };

  // V2.1: category coverage — written by build-pool-p1 (replaced check-coverage in v2.2)
  categoryCoverage?: Record<string, boolean>;

  // V2.2: pre-built restaurant pool, populated during lobby phase by build-pool-p1/p2/p3.
  // Keyed by cuisineId, plus a "complete" boolean written by p3.
  // Deleted immediately after stack generation to reclaim Firebase storage.
  pool?: Record<string, unknown>;

  responses?: {
    dineIn?: Record<string, string>;
    distance?: Record<string, number>;
    price?: Record<string, string>;
    veto?: Record<string, string>;    // cuisine ID string, or "pass"
    vetoDone?: Record<string, boolean>;
    dietary?: Record<string, string[]>;
    dietaryDone?: Record<string, boolean>;
    preferences?: Record<string, string[]>;
    preferencesDone?: Record<string, boolean>;
    preferencesPositive?: Record<string, string[]>;
    preferencesPositiveDone?: Record<string, boolean>;
    preferencesNegative?: Record<string, string[]>;
    preferencesNegativeDone?: Record<string, boolean>;
  };

  swipeComplete?: Record<string, boolean>;
  swipeDecisions?: Record<string, Record<string, string>>;

  result?: {
    complete: RestaurantResult[];
    majority: RestaurantResult[];
    partial: RestaurantResult[];
  };
}
