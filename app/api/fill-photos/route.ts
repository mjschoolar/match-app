// app/api/fill-photos/route.ts
// Change 5: Second-pass photo fill.
//
// The main generate-stack route caps photo resolution at 20 concurrent calls to
// stay within Vercel's 10-second function limit. Restaurants beyond the cap are
// written to Firebase with photoUrl: null but with photoReferenceName set (the
// Google photo resource name). This route reads those null-photo restaurants,
// resolves their URLs, and writes each result back to Firebase individually as it
// resolves — photos trickle in during the preload phase rather than all at once.
//
// Called by the creator's device immediately after stack/generated: true is
// detected, in parallel with the photo preloading process.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { ref, get, set } from "firebase/database";
import type { StackRestaurant } from "@/lib/types";

const PHOTO_BASE = "https://places.googleapis.com/v1";

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

export async function POST(req: NextRequest) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const body = await req.json() as { sessionId?: string };
  const { sessionId } = body;
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    const stackRef = ref(db, `sessions/${sessionId}/stack`);
    const snap = await get(stackRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: "Stack not found" }, { status: 404 });
    }

    const stack = snap.val();
    const restaurants = stack.restaurants;

    if (!restaurants) {
      // No restaurants — nothing to fill
      await set(ref(db, `sessions/${sessionId}/stack/photosFilled`), true);
      return NextResponse.json({ ok: true, filled: 0 });
    }

    // Normalize restaurants to an array of { index, restaurant } entries.
    // Firebase may return arrays as objects with integer keys.
    type Entry = { index: string | number; restaurant: StackRestaurant };
    const entries: Entry[] = [];

    if (Array.isArray(restaurants)) {
      restaurants.forEach((r: StackRestaurant, i: number) =>
        entries.push({ index: i, restaurant: r })
      );
    } else {
      Object.entries(restaurants as Record<string, StackRestaurant>).forEach(([key, r]) =>
        entries.push({ index: key, restaurant: r })
      );
    }

    // Only process restaurants with null photoUrl but a resolvable photoReferenceName
    const nullPhotoEntries = entries.filter(
      ({ restaurant: r }) =>
        (r.photoUrl === null || r.photoUrl === undefined) &&
        typeof r.photoReferenceName === "string" &&
        r.photoReferenceName.length > 0
    );

    if (nullPhotoEntries.length === 0) {
      // All photos already resolved — nothing to do
      await set(ref(db, `sessions/${sessionId}/stack/photosFilled`), true);
      return NextResponse.json({ ok: true, filled: 0 });
    }

    let filled = 0;

    // Resolve photos in parallel, writing each result to Firebase individually
    // as it resolves so photos trickle in during the preload phase.
    await Promise.all(
      nullPhotoEntries.map(async ({ index, restaurant }) => {
        const url = await resolvePhoto(restaurant.photoReferenceName!);
        if (url) {
          filled++;
          await set(
            ref(db, `sessions/${sessionId}/stack/restaurants/${index}/photoUrl`),
            url
          );
        }
      })
    );

    // Mark fill as complete — whatever resolved is in Firebase, the rest fall back
    // to cuisine hero images in SwipeCard.
    await set(ref(db, `sessions/${sessionId}/stack/photosFilled`), true);

    return NextResponse.json({ ok: true, filled });
  } catch (err) {
    console.error("[fill-photos] Error:", err, "sessionId:", sessionId);
    // Do not write photosFilled on error — the client accepts the partial state
    return NextResponse.json({ error: "Fill photos failed" }, { status: 500 });
  }
}
