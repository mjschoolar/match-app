// app/api/geocode/route.ts
// Server-side geocoding via Google Geocoding API.
// Handles both directions:
//   Reverse: { lat, lng } → { lat, lng, label }   (GPS coords → neighborhood name)
//   Forward: { address }  → { lat, lng, label }   (text address → coords + name)
//
// The Google Places API key is reused — Geocoding API uses the same key.
// Key is server-side only, never exposed to the browser.

import { NextRequest, NextResponse } from "next/server";

const GEO_BASE = "https://maps.googleapis.com/maps/api/geocode/json";

// Extract a human-readable neighborhood/city name from a geocode result.
// Tries: neighborhood → sublocality → locality → first comma-segment of formatted address.
// Appends the state abbreviation (e.g. ", TX") from administrative_area_level_1.
function extractLabel(result: Record<string, unknown>): string {
  const components = (result.address_components as Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>) || [];

  const findLong = (types: string[]) =>
    components.find((c) => types.some((t) => c.types.includes(t)))?.long_name;
  const findShort = (types: string[]) =>
    components.find((c) => types.some((t) => c.types.includes(t)))?.short_name;

  const city =
    findLong(["neighborhood"]) ||
    findLong(["sublocality_level_1", "sublocality"]) ||
    findLong(["locality"]);
  const state = findShort(["administrative_area_level_1"]);

  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  return (result.formatted_address as string)?.split(",")[0] || "Unknown location";
}

export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const body = await req.json();
  const { lat, lng, address } = body as {
    lat?: number;
    lng?: number;
    address?: string;
  };

  try {
    let url: string;

    if (typeof lat === "number" && typeof lng === "number") {
      // Reverse geocode
      url = `${GEO_BASE}?latlng=${lat},${lng}&key=${key}`;
    } else if (address) {
      // Forward geocode
      url = `${GEO_BASE}?address=${encodeURIComponent(address)}&key=${key}`;
    } else {
      return NextResponse.json({ error: "Provide lat+lng or address" }, { status: 400 });
    }

    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status !== "OK" || !data.results?.length) {
      return NextResponse.json(
        { error: "Location not found", geocodeStatus: data.status },
        { status: 422 }
      );
    }

    const result = data.results[0];
    const label = extractLabel(result);
    const loc = result.geometry?.location;

    return NextResponse.json({
      lat: typeof lat === "number" ? lat : loc?.lat,
      lng: typeof lng === "number" ? lng : loc?.lng,
      label,
    });
  } catch (err) {
    console.error("[geocode] Error:", err);
    return NextResponse.json({ error: "Geocoding failed" }, { status: 500 });
  }
}
