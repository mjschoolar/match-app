"use client";
// DistanceScreen — Pre-swipe step 2.
//
// V2.0 changes:
//   - Max radius changed from 30 to 15 miles (brief spec).
//   - Default is 5 miles (Dallas-calibrated starting point).
//   - Live option count: "5 miles — about 43 places" debounced at 600ms after drag.
//     Reads from /api/location-count using the session's stored location.
//   - "lots of spots" shown when count hits the API's 20-result page limit (hasMore: true).
//   - Loading shimmer while count is fetching.
//   - Count cached per radius so dragging back to a queried value shows instantly.

import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "@/lib/firebase";
import { ref, set, get } from "firebase/database";
import { Session } from "@/lib/types";

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

const MIN_MILES = 1;
const MAX_MILES = 15;
const DEFAULT_MILES = 5;

type CountState = { count: number; hasMore: boolean } | "loading" | null;

export default function DistanceScreen({ sessionId, session, participantId }: Props) {
  const [sliderValue, setSliderValue] = useState(DEFAULT_MILES);
  const [countState, setCountState] = useState<CountState>(null);

  // Cache: radiusMiles → { count, hasMore } so dragging back to a queried value is instant
  const countCache = useRef<Map<number, { count: number; hasMore: boolean }>>(new Map());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isReveal = session.phase === "distance-reveal";
  const isCreator = session.creatorId === participantId;
  const participants = Object.entries(session.participants || {});
  const totalParticipants = participants.length;
  const responses = session.responses?.distance || {};
  const myResponse = responses[participantId];
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  const totalResponded = Object.keys(responses).length;
  const iAmLocked = myResponse !== undefined;

  const dineInVotes = Object.values(session.responses?.dineIn || {});
  const deliveryCount = dineInVotes.filter((v) => v === "delivery").length;
  const isDelivery = deliveryCount > dineInVotes.length / 2;

  const locationLat = session.location?.lat;
  const locationLng = session.location?.lng;

  // Fetch count for a given radius value
  const fetchCount = useCallback(
    async (miles: number) => {
      if (!locationLat || !locationLng) return;

      // Check cache first
      const cached = countCache.current.get(miles);
      if (cached) {
        setCountState(cached);
        return;
      }

      setCountState("loading");

      try {
        const radiusMeters = miles * 1609.34;
        const res = await fetch("/api/location-count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: locationLat, lng: locationLng, radiusMeters }),
        });

        if (!res.ok) throw new Error("Count failed");

        const data = await res.json() as { count: number; hasMore: boolean };
        countCache.current.set(miles, data);
        setCountState(data);
      } catch {
        setCountState(null);
      }
    },
    [locationLat, locationLng]
  );

  // Fetch count on mount for the default value
  useEffect(() => {
    if (!isReveal && !iAmLocked && locationLat && locationLng) {
      fetchCount(DEFAULT_MILES);
    }
  }, [isReveal, iAmLocked, locationLat, locationLng, fetchCount]);

  // Debounced count fetch on slider change
  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (iAmLocked) return;
    const val = Number(e.target.value);
    setSliderValue(val);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      fetchCount(val);
    }, 600);
  }

  function formatCountLabel(miles: number, state: CountState): string {
    if (!state || state === "loading") return `${miles} mi`;
    if (state.hasMore) return `${miles} mi — lots of spots`;
    if (state.count === 0) return `${miles} mi — no spots nearby`;
    return `${miles} mi — about ${state.count} places`;
  }

  async function handleSubmit() {
    if (iAmLocked) return;

    await set(
      ref(db, `sessions/${sessionId}/responses/distance/${participantId}`),
      sliderValue
    );

    const allIds = Object.keys(session.participants || {});
    const snap = await get(ref(db, `sessions/${sessionId}/responses/distance`));
    const current = snap.val() || {};
    const allVoted = allIds.every((id) => current[id] !== undefined);

    if (allVoted) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await set(ref(db, `sessions/${sessionId}/phase`), "distance-reveal");
    }
  }

  async function handleContinue() {
    await set(ref(db, `sessions/${sessionId}/phase`), "price");
  }

  function getMedianDistance(): number {
    const values = (Object.values(responses) as number[]).sort((a, b) => a - b);
    if (values.length === 0) return 0;
    const mid = Math.floor(values.length / 2);
    return values.length % 2 !== 0 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
  }

  function getSummary(): string {
    const values = Object.values(responses) as number[];
    const median = getMedianDistance();
    const allSame = values.every((v) => v === median);

    if (allSame) {
      return median <= 2
        ? `Everyone's keeping it close — looking within ${median} mile${median === 1 ? "" : "s"}.`
        : `Everyone's on the same page — looking within ${median} miles.`;
    }
    return `Splitting the difference — looking within ${median} miles.`;
  }

  const lockedDisplayValue = iAmLocked ? myResponse : sliderValue;

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        <div className="text-center space-y-1">
          <h2 className="text-2xl font-semibold leading-snug">
            {isDelivery ? "How far can they deliver?" : "How far are you willing to go?"}
          </h2>
          {isDelivery && (
            <p className="text-sm text-gray-500">Most delivery services reach 5–10 miles.</p>
          )}
        </div>

        {/* ── VOTING STATE ── */}
        {!isReveal && (
          <>
            <div className="space-y-4 bg-gray-800 rounded-2xl p-5">
              {/* Value + live count display */}
              <div className="text-center">
                <span className="text-4xl font-bold">{lockedDisplayValue}</span>
                <span className="text-gray-400 text-lg ml-1">mi</span>
                {iAmLocked && (
                  <span className="ml-3 text-green-400 text-sm font-medium">Locked in ✓</span>
                )}

                {/* Live count — shown when not locked, location available */}
                {!iAmLocked && locationLat && locationLng && (
                  <div className="mt-2 h-5">
                    {countState === "loading" ? (
                      <span className="text-xs text-gray-600 animate-pulse">
                        Counting spots…
                      </span>
                    ) : countState ? (
                      <span className="text-xs text-gray-400">
                        {formatCountLabel(sliderValue, countState).split(" — ")[1] ?? ""}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Slider */}
              <input
                type="range"
                min={MIN_MILES}
                max={MAX_MILES}
                step={1}
                value={iAmLocked ? myResponse : sliderValue}
                onChange={handleSliderChange}
                disabled={iAmLocked}
                className={[
                  "w-full accent-white",
                  iAmLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              />
              <div className="flex justify-between text-sm text-gray-500">
                <span>1 mi</span>
                <span>15 mi</span>
              </div>

              {/* Submit */}
              {!iAmLocked && (
                <button
                  onClick={handleSubmit}
                  className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
                >
                  That works for me
                </button>
              )}
            </div>

            <p className="text-center text-sm text-gray-400">
              {totalResponded} of {totalParticipants} locked in
            </p>
          </>
        )}

        {/* ── REVEAL STATE ── */}
        {isReveal && (
          <>
            <div className="space-y-2">
              {participants.map(([id, participant]) => {
                const response = responses[id] as number | undefined;
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3"
                  >
                    <span className="font-medium">
                      {participant.name}
                      {id === participantId && (
                        <span className="text-gray-500 font-normal"> (you)</span>
                      )}
                    </span>
                    <span className={response !== undefined ? "text-green-400" : "text-gray-500"}>
                      {response !== undefined ? `✓ ${response} mi` : "..."}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-lg font-medium pt-2">{getSummary()}</p>

            {isCreator && (
              <button
                onClick={handleContinue}
                className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
              >
                Continue
              </button>
            )}

            {!isCreator && (
              <p className="text-center text-gray-400 text-sm pt-2">
                Waiting for {creatorName} to continue…
              </p>
            )}
          </>
        )}

      </div>
    </main>
  );
}
