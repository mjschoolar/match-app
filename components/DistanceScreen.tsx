"use client";
// DistanceScreen — Pre-swipe step 2 of 6.
//
// V2 changes:
//   - "N of 3 locked in" counter replaces the named response list during voting
//   - Slider stays visible in locked/disabled state after submitting
//   - 1000ms delay before phase advances on the last submission
//   - Tiebreaker: median (changed from minimum in V1)

import { useState } from "react";
import { db } from "@/lib/firebase";
import { ref, set, get } from "firebase/database";
import { Session } from "@/lib/types";

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

export default function DistanceScreen({ sessionId, session, participantId }: Props) {
  const [sliderValue, setSliderValue] = useState(3);

  const isReveal = session.phase === "distance-reveal";
  const isCreator = session.creatorId === participantId;
  const participants = Object.entries(session.participants || {});
  const totalParticipants = participants.length;
  const responses = session.responses?.distance || {};
  const myResponse = responses[participantId]; // undefined until submitted
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  const totalResponded = Object.keys(responses).length;
  const iAmLocked = myResponse !== undefined;

  // Determine group dine-in outcome from individual votes
  const dineInVotes = Object.values(session.responses?.dineIn || {});
  const deliveryCount = dineInVotes.filter((v) => v === "delivery").length;
  const isDelivery = deliveryCount > dineInVotes.length / 2;

  async function handleSubmit() {
    if (iAmLocked) return; // guard against double-tap

    await set(
      ref(db, `sessions/${sessionId}/responses/distance/${participantId}`),
      sliderValue
    );

    // Fresh read to avoid race condition
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

  // V2 tiebreaker: median distance (not minimum)
  function getMedianDistance(): number {
    const values = (Object.values(responses) as number[]).sort((a, b) => a - b);
    if (values.length === 0) return 0;
    const mid = Math.floor(values.length / 2);
    // Odd count: middle value. Even count: lower of the two middle values.
    return values.length % 2 !== 0 ? values[mid] : values[mid - 1];
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
    // Spread exists — acknowledge the middle-ground feel
    return `Splitting the difference — looking within ${median} miles.`;
  }

  // The display value for the slider in locked state
  const lockedDisplayValue = iAmLocked ? myResponse : sliderValue;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        <div className="text-center space-y-1">
          <h2 className="text-2xl font-semibold leading-snug">
            {isDelivery ? "How far can they deliver?" : "How far are you willing to go?"}
          </h2>
          {isDelivery && (
            <p className="text-sm text-gray-500">Most delivery services reach 5–10 miles.</p>
          )}
        </div>

        {/* ── VOTING STATE — slider always visible, locked after submitting ── */}
        {!isReveal && (
          <>
            <div className="space-y-4 bg-gray-800 rounded-2xl p-5">
              {/* Value display */}
              <div className="text-center">
                <span className="text-4xl font-bold">{lockedDisplayValue}</span>
                <span className="text-gray-400 text-lg ml-1">mi</span>
                {iAmLocked && (
                  <span className="ml-3 text-green-400 text-sm font-medium">Locked in ✓</span>
                )}
              </div>

              {/* Slider — disabled after locking in */}
              <input
                type="range"
                min={1}
                max={30}
                step={1}
                value={iAmLocked ? myResponse : sliderValue}
                onChange={(e) => {
                  if (!iAmLocked) setSliderValue(Number(e.target.value));
                }}
                disabled={iAmLocked}
                className={[
                  "w-full accent-white",
                  iAmLocked ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                ].join(" ")}
              />
              <div className="flex justify-between text-sm text-gray-500">
                <span>1 mi</span>
                <span>30 mi</span>
              </div>

              {/* Submit button — hidden after locking in */}
              {!iAmLocked && (
                <button
                  onClick={handleSubmit}
                  className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
                >
                  That works for me
                </button>
              )}
            </div>

            {/* Response progress — no names, just count */}
            <p className="text-center text-sm text-gray-400">
              {totalResponded} of {totalParticipants} locked in
            </p>
          </>
        )}

        {/* ── REVEAL STATE — named attribution list ── */}
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
                Waiting for {creatorName} to continue...
              </p>
            )}
          </>
        )}

      </div>
    </main>
  );
}
