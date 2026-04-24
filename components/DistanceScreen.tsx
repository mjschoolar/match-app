"use client";
// DistanceScreen — Pre-swipe step 2 of 6.
//
// Each participant sets a distance (1–10 miles) using a slider.
// Responses appear live on everyone's screen as they're submitted.
// When all have responded, the phase flips to "distance-reveal".
//
// Tie-breaking: we use the minimum (most conservative) distance so
// the result works for everyone in the group.

import { useState } from "react";
import { db } from "@/lib/firebase";
import { ref, set } from "firebase/database";
import { Session } from "@/lib/types";

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

export default function DistanceScreen({ sessionId, session, participantId }: Props) {
  const [sliderValue, setSliderValue] = useState(3); // default: 3 miles

  const isReveal = session.phase === "distance-reveal";
  const isCreator = session.creatorId === participantId;
  const participants = Object.entries(session.participants || {});
  const responses = session.responses?.distance || {};
  const myResponse = responses[participantId];
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  async function handleSubmit() {
    await set(
      ref(db, `sessions/${sessionId}/responses/distance/${participantId}`),
      sliderValue
    );

    // Check if everyone has now submitted
    const allIds = Object.keys(session.participants || {});
    const updatedResponses = { ...responses, [participantId]: sliderValue };
    const allVoted = allIds.every((id) => updatedResponses[id] !== undefined);

    if (allVoted) {
      await set(ref(db, `sessions/${sessionId}/phase`), "distance-reveal");
    }
  }

  async function handleContinue() {
    await set(ref(db, `sessions/${sessionId}/phase`), "price");
  }

  // The group's agreed distance = minimum submitted (most conservative)
  function getGroupDistance(): number {
    const values = Object.values(responses) as number[];
    if (values.length === 0) return 0;
    return Math.min(...values);
  }

  function getSummary(): string {
    const min = getGroupDistance();
    if (min <= 2) return `Staying very close — looking within ${min} mile${min === 1 ? "" : "s"}.`;
    if (min <= 5) return `Staying close — looking within ${min} miles.`;
    return `Going a bit further — looking within ${min} miles.`;
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        <h2 className="text-2xl font-semibold text-center leading-snug">
          How far are you willing to go tonight?
        </h2>

        {/* Slider — only shown before this participant has submitted */}
        {!isReveal && !myResponse && (
          <div className="space-y-4 bg-gray-800 rounded-2xl p-5">
            <div className="text-center">
              <span className="text-4xl font-bold">{sliderValue}</span>
              <span className="text-gray-400 text-lg ml-1">mi</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={sliderValue}
              onChange={(e) => setSliderValue(Number(e.target.value))}
              className="w-full accent-white cursor-pointer"
            />
            <div className="flex justify-between text-sm text-gray-500">
              <span>1 mi</span>
              <span>10 mi</span>
            </div>
            <button
              onClick={handleSubmit}
              className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
            >
              That works for me
            </button>
          </div>
        )}

        {/* Waiting message after submitting, before reveal */}
        {!isReveal && myResponse !== undefined && (
          <div className="bg-gray-800 rounded-2xl p-4 text-center">
            <p className="text-gray-400 text-sm">You picked <span className="text-white font-semibold">{myResponse} mi</span> — waiting for others...</p>
          </div>
        )}

        {/* Live response list */}
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

        {/* Reveal: summary */}
        {isReveal && (
          <p className="text-center text-lg font-medium pt-2">{getSummary()}</p>
        )}

        {/* Reveal: creator Continue */}
        {isReveal && isCreator && (
          <button
            onClick={handleContinue}
            className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
          >
            Continue
          </button>
        )}

        {/* Reveal: joiner waiting */}
        {isReveal && !isCreator && (
          <p className="text-center text-gray-400 text-sm pt-2">
            Waiting for {creatorName} to continue...
          </p>
        )}

      </div>
    </main>
  );
}
