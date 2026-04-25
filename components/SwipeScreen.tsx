"use client";
// SwipeScreen — the core mechanic.
//
// Each participant works through the 10 cards independently and privately.
// Every decision is written to Firebase immediately. When a participant
// finishes all 10, they're marked complete. When the LAST participant
// finishes, this component:
//   1. Calculates the match results from actual swipe data
//   2. Writes the results to Firebase
//   3. Writes phase: "anticipation" — fires on all devices simultaneously
//
// The anticipation screen handles the auto-advance to "summary".

import { useState } from "react";
import { db } from "@/lib/firebase";
import { ref, set } from "firebase/database";
import { Session } from "@/lib/types";
import { RESTAURANTS } from "@/lib/constants";

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

// Star rating display: 4.3 → ★★★★☆
function stars(rating: number): string {
  const filled = Math.round(rating);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

export default function SwipeScreen({ sessionId, session, participantId }: Props) {
  // Initialize from Firebase in case of page refresh mid-swipe
  const existing = (session.swipeDecisions?.[participantId] || {}) as Record<string, string>;
  const [decisions, setDecisions] = useState<Record<string, "right" | "left">>(
    existing as Record<string, "right" | "left">
  );
  const [expanded, setExpanded] = useState(false);
  const [swiping, setSwiping] = useState(false); // prevents double-tap

  const currentIndex = Object.keys(decisions).length;
  const currentCard = RESTAURANTS[currentIndex];

  async function handleSwipe(direction: "right" | "left") {
    if (!currentCard || swiping) return;
    setSwiping(true);
    setExpanded(false);

    const newDecisions = { ...decisions, [currentCard.id]: direction };
    setDecisions(newDecisions);

    // Write this single decision to Firebase
    await set(
      ref(db, `sessions/${sessionId}/swipeDecisions/${participantId}/${currentCard.id}`),
      direction
    );

    // If we just finished the last card, mark complete
    if (Object.keys(newDecisions).length === RESTAURANTS.length) {
      await set(
        ref(db, `sessions/${sessionId}/swipeComplete/${participantId}`),
        true
      );

      // Check if ALL participants are now complete
      const allIds = Object.keys(session.participants || {});
      const updatedComplete = { ...(session.swipeComplete || {}), [participantId]: true };
      const allDone = allIds.every((id) => updatedComplete[id] === true);

      if (allDone) {
        // Merge this participant's fresh decisions with what's already in Firebase
        const allDecisions = {
          ...(session.swipeDecisions || {}),
          [participantId]: newDecisions,
        };

        // Calculate results from actual swipe data
        const result = calculateResults(allDecisions, allIds);

        // Write results, then trigger the anticipation beat on all devices
        await set(ref(db, `sessions/${sessionId}/result`), result);
        await set(ref(db, `sessions/${sessionId}/phase`), "anticipation");
      }
    }

    setSwiping(false);
  }

  // Derive match tiers from swipe decisions
  function calculateResults(
    allDecisions: Record<string, Record<string, string>>,
    allIds: string[]
  ) {
    const total = allIds.length;
    const complete = [];
    const majority = [];
    const partial = [];

    for (const r of RESTAURANTS) {
      const rightCount = allIds.filter(
        (pid) => allDecisions[pid]?.[r.id] === "right"
      ).length;

      const entry = {
        id: r.id,
        name: r.name,
        cuisine: r.cuisine,
        rating: r.rating,
        distance: r.distance,
      };

      if (rightCount === total) complete.push(entry);
      else if (rightCount > total / 2) majority.push(entry);
      else if (rightCount > 0) partial.push(entry);
    }

    return { complete, majority, partial };
  }

  if (!currentCard) return null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-5">

        {/* Restaurant card — tap anywhere to toggle depth layer */}
        <div
          onClick={() => setExpanded((e) => !e)}
          className="bg-gray-800 rounded-2xl p-6 space-y-4 cursor-pointer touch-manipulation select-none"
        >

          {/* Main info + expand indicator */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">{currentCard.name}</h2>
              <p className="text-gray-400 mt-0.5">{currentCard.cuisine}</p>
            </div>
            <span className={[
              "text-gray-500 text-lg flex-shrink-0 mt-1 transition-transform duration-200",
              expanded ? "rotate-180" : "",
            ].join(" ")}>
              ↓
            </span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="text-yellow-400 tracking-tight">{stars(currentCard.rating)}</span>
            <span className="text-gray-300">{currentCard.rating}</span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-300">{currentCard.distance}</span>
          </div>

          {/* Depth layer */}
          {expanded && (
            <div className="pt-3 border-t border-gray-700 space-y-2 text-sm text-gray-300">
              <div className="flex gap-2">
                <span className="text-gray-500 w-24 flex-shrink-0">Price</span>
                <span>{currentCard.price}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 w-24 flex-shrink-0">Known for</span>
                <span>{currentCard.knownFor}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 w-24 flex-shrink-0">Hours</span>
                <span>{currentCard.hours}</span>
              </div>
            </div>
          )}
        </div>

        {/* Pass / Yes buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleSwipe("left")}
            disabled={swiping}
            className="py-5 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation disabled:opacity-50 transition-colors"
          >
            ✕  Pass
          </button>
          <button
            onClick={() => handleSwipe("right")}
            disabled={swiping}
            className="py-5 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation disabled:opacity-50 transition-colors"
          >
            ✓  Yes
          </button>
        </div>

      </div>
    </main>
  );
}
