// app/api/location-count/route.ts
// Returns the rough count of venues at a given location and radius.
// Used by the distance slider to show "5 miles — about 43 places".
//
// Makes a single Nearby Search call with no includedTypes filter (all venue types).
// Returns count (0–20) and hasMore (true = at least 21 exist → show "lots of spots").

import { NextRequest, NextResponse } from "next/server";

const NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";

export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const { lat, lng, radiusMeters } = await req.json() as {
    lat: number;
    lng: number;
    radiusMeters: number;
  };

  if (!lat || !lng || !radiusMeters) {
    return NextResponse.json({ error: "lat, lng, radiusMeters required" }, { status: 400 });
  }

  try {
    const resp = await fetch(NEARBY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // Minimal field mask — we only need to count results
        // nextPageToken is a response-level field — it must NOT appear in the FieldMask
        "X-Goog-FieldMask": "places.id",
      },
      body: JSON.stringify({
        // Filter to restaurants only — otherwise gas stations and shops inflate the count
        includedTypes: ["restaurant"],
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radiusMeters,
          },
        },
        maxResultCount: 20,
      }),
    });

    const data = await resp.json();
    const count = (data.places || []).length as number;
    const hasMore = !!data.nextPageToken;

    return NextResponse.json({ count, hasMore });
  } catch (err) {
    console.error("[location-count] Error:", err);
    return NextResponse.json({ count: 0, hasMore: false }, { status: 500 });
  }
}
