"use client";
// GeneratingStackScreen — V2.0: API-driven, not a timed simulation.
//
// Flow:
//   1. All devices see this screen simultaneously when phase = generating-stack.
//   2. The creator's device POSTs to /api/generate-stack.
//   3. The API route runs the full algorithm and writes stack/generated: true to Firebase.
//   4. All devices watch session.stack?.generated (via the parent's onValue subscription).
//   5. When stack/generated = true: all devices preload photo URLs.
//   6. The creator advances to "swipe" after preloading finishes + 3-second minimum.
//
// Error handling:
//   - stack/error: "thin-pool" → graceful message (recovery in V2.1)
//   - stack/error: "api-failure" → graceful message
//   - stack/reducedPool: true → pre-swipe disclosure line

import { useEffect, useRef, useState } from "react";
import { db } from "@/lib/firebase";
import { ref, set } from "firebase/database";
import { Session, StackRestaurant } from "@/lib/types";

interface Props {
  sessionId: string;
  session: Session;
  isCreator: boolean;
}

// Firebase can return arrays as {0: ..., 1: ..., ...} objects — normalise both
function normalizeRestaurants(
  val: StackRestaurant[] | Record<string, StackRestaurant> | undefined
): StackRestaurant[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.values(val);
}

export default function GeneratingStackScreen({ sessionId, session, isCreator }: Props) {
  const apiCalledRef = useRef(false);
  const [imagesPreloaded, setImagesPreloaded] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [hasAdvanced, setHasAdvanced] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const stackGenerated = session.stack?.generated === true;
  const stackError = session.stack?.error;
  const reducedPool = session.stack?.reducedPool === true;

  // ── 1. Creator kicks off the API call ──────────────────────────────────────
  useEffect(() => {
    if (!isCreator || apiCalledRef.current) return;
    apiCalledRef.current = true;

    fetch("/api/generate-stack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }).catch((err) => {
      console.error("[GeneratingStackScreen] API call failed:", err);
    });
  }, [isCreator, sessionId]);

  // ── 2. Minimum display time (3 seconds, all devices) ─────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // ── 2b. Client-side timeout — if stack never generates, surface an error ──
  // Covers the case where the API call fails without writing stack/error to Firebase
  useEffect(() => {
    if (stackGenerated || stackError) return;
    const timeout = setTimeout(() => setTimedOut(true), 45000);
    return () => clearTimeout(timeout);
  }, [stackGenerated, stackError]);

  // ── 3. Preload photos when stack is ready (all devices) ──────────────────
  useEffect(() => {
    if (!stackGenerated) return;

    const restaurants = normalizeRestaurants(session.stack?.restaurants);
    const photoUrls = restaurants
      .map((r) => r.photoUrl)
      .filter((url): url is string => typeof url === "string" && url.length > 0);

    if (photoUrls.length === 0) {
      setImagesPreloaded(true);
      return;
    }

    let loaded = 0;
    const total = photoUrls.length;

    photoUrls.forEach((url) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded++;
        if (loaded >= total) setImagesPreloaded(true);
      };
      img.src = url;
    });

    // Safety fallback: if preloading hangs, advance after 8 seconds regardless
    const fallback = setTimeout(() => setImagesPreloaded(true), 8000);
    return () => clearTimeout(fallback);
  }, [stackGenerated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Creator advances phase when both conditions are met ────────────────
  useEffect(() => {
    if (!isCreator) return;
    if (!stackGenerated) return;
    if (!imagesPreloaded) return;
    if (!minTimeElapsed) return;
    if (hasAdvanced) return;

    setHasAdvanced(true);
    set(ref(db, `sessions/${sessionId}/phase`), "swipe").catch(console.error);
  }, [isCreator, stackGenerated, imagesPreloaded, minTimeElapsed, hasAdvanced, sessionId]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (stackError === "thin-pool") {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
        <div className="max-w-sm w-full text-center space-y-4">
          <p className="text-2xl font-semibold">Not enough spots nearby.</p>
          <p className="text-gray-400 text-sm leading-relaxed">
            We couldn&apos;t find enough restaurants that matched. Try expanding your distance
            or choosing a different price range.
          </p>
          <button
            onClick={() => { window.location.href = "/"; }}
            className="w-full py-4 bg-gray-800 text-gray-300 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
          >
            Start over
          </button>
        </div>
      </main>
    );
  }

  if (timedOut && !stackGenerated) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
        <div className="max-w-sm w-full text-center space-y-4">
          <p className="text-2xl font-semibold">Something went wrong.</p>
          <p className="text-gray-400 text-sm">
            We couldn&apos;t pull the restaurant data. Check your connection and try again.
          </p>
          <p className="text-gray-600 text-xs font-mono">{sessionId}</p>
          <button
            onClick={() => { window.location.href = "/"; }}
            className="w-full py-4 bg-gray-800 text-gray-300 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
          >
            Start over
          </button>
        </div>
      </main>
    );
  }

  if (stackError === "api-failure") {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
        <div className="max-w-sm w-full text-center space-y-4">
          <p className="text-2xl font-semibold">Something went wrong.</p>
          <p className="text-gray-400 text-sm">
            We couldn&apos;t pull the restaurant data. Check your connection and try again.
          </p>
          <p className="text-gray-600 text-xs font-mono">{sessionId}</p>
          <button
            onClick={() => { window.location.href = "/"; }}
            className="w-full py-4 bg-gray-800 text-gray-300 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
          >
            Start over
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full text-center space-y-3">
        <p className="text-2xl font-semibold">Generating your stack</p>
        {reducedPool ? (
          <p className="text-gray-400 text-sm">
            We found fewer spots than usual — here&apos;s what matched.
          </p>
        ) : (
          <p className="text-gray-500 text-sm">Pulling together everything you told us</p>
        )}
      </div>
    </main>
  );
}
