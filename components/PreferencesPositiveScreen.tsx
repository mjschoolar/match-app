"use client";
// PreferencesPositiveScreen — V4 preference flow, pass 1 of 2.
// "What are you feeling tonight?" — positive signal, green direction.
// Cap: Math.max(2, Math.round(CUISINES.length * 0.25)) = 6 at 22 categories.
// Tile counts accumulate live so the group can see activity — attribution
// stays hidden until the combined reveal. Silent auto-advance to
// preferences-negative when all participants lock in.

import { useState } from "react";
import { db } from "@/lib/firebase";
import { ref, set, get, remove } from "firebase/database";
import { Session } from "@/lib/types";
import { CUISINES } from "@/lib/constants";

const PREF_CAP = Math.max(2, Math.round(CUISINES.length * 0.25));

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

export default function PreferencesPositiveScreen({ sessionId, session, participantId }: Props) {
  const participants = Object.entries(session.participants || {});
  const prefPositiveResponses = session.responses?.preferencesPositive || {};
  const prefPositiveDone = session.responses?.preferencesPositiveDone || {};

  const [localSelections, setLocalSelections] = useState<string[]>(() =>
    Array.isArray(prefPositiveResponses[participantId]) ? prefPositiveResponses[participantId] : []
  );
  const [lockedIn, setLockedIn] = useState(false);

  const iAmDone = lockedIn || !!prefPositiveDone[participantId];

  function othersPickCountFor(cuisineId: string): number {
    return Object.entries(prefPositiveResponses)
      .filter(([pid, v]) => pid !== participantId && Array.isArray(v) && (v as string[]).includes(cuisineId))
      .length;
  }

  function toggleCuisine(id: string) {
    if (iAmDone) return;
    const isSelected = localSelections.includes(id);
    if (!isSelected && localSelections.length >= PREF_CAP) return;

    const next = isSelected
      ? localSelections.filter((s) => s !== id)
      : [...localSelections, id];

    setLocalSelections(next);

    const prefRef = ref(db, `sessions/${sessionId}/responses/preferencesPositive/${participantId}`);
    if (next.length > 0) {
      set(prefRef, next);
    } else {
      remove(prefRef);
    }
  }

  async function handleLockIn() {
    setLockedIn(true);

    if (localSelections.length > 0) {
      await set(
        ref(db, `sessions/${sessionId}/responses/preferencesPositive/${participantId}`),
        localSelections
      );
    }

    await set(
      ref(db, `sessions/${sessionId}/responses/preferencesPositiveDone/${participantId}`),
      true
    );

    const allIds = Object.keys(session.participants || {});
    const snap = await get(ref(db, `sessions/${sessionId}/responses/preferencesPositiveDone`));
    const current = snap.val() || {};
    const allDone = allIds.every((id) => current[id] === true);

    if (allDone) {
      await set(ref(db, `sessions/${sessionId}/phase`), "preferences-negative");
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        <div>
          <h2 className="text-2xl font-semibold text-center leading-snug">
            What are you feeling tonight?
          </h2>
          <p className="text-gray-400 text-sm text-center mt-1">
            {iAmDone ? "Locked in ✓" : "Only you can see which are yours."}
          </p>
        </div>

        {!iAmDone && (
          <p className="text-center text-sm text-gray-400">
            {localSelections.length === 0 ? "Nothing selected yet" : `${localSelections.length} selected`}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          {CUISINES.map((cuisine) => {
            const iMine = localSelections.includes(cuisine.id);
            const othersCount = othersPickCountFor(cuisine.id);
            // Total visible count: others + self (when I've also picked it)
            const totalCount = othersCount + (iMine ? 1 : 0);
            const atMax = !iMine && localSelections.length >= PREF_CAP;

            return (
              <button
                key={cuisine.id}
                onClick={() => toggleCuisine(cuisine.id)}
                disabled={atMax || iAmDone}
                className={[
                  "py-2.5 px-2 rounded-xl text-sm font-medium transition-colors touch-manipulation flex flex-col items-center gap-0.5 min-h-[52px] justify-center",
                  iMine
                    ? "bg-green-500/20 text-green-300 border border-green-500/40 cursor-pointer"
                    : atMax && othersCount > 0
                    ? "bg-green-500/10 text-green-300/70 border border-green-500/20 cursor-default opacity-60"
                    : atMax
                    ? "bg-gray-800 text-gray-600 cursor-default opacity-40"
                    : othersCount > 0
                    ? "bg-green-500/10 text-green-300/70 border border-green-500/20 cursor-pointer"
                    : iAmDone
                    ? "bg-gray-800 text-gray-600 cursor-default"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer",
                ].join(" ")}
              >
                <span className="leading-snug text-center">
                  {(iMine || othersCount > 0) && <span className="mr-0.5">✓</span>}
                  {cuisine.label}
                </span>
                {totalCount > 0 && (
                  <span className="text-xs font-normal opacity-60">({totalCount})</span>
                )}
              </button>
            );
          })}
        </div>

        {!iAmDone && (
          <button
            onClick={handleLockIn}
            className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
          >
            {localSelections.length === 0 ? "Anything works for me" : "Lock in"}
          </button>
        )}

        <div className="space-y-2">
          {participants.map(([id, participant]) => {
            const done = !!prefPositiveDone[id] || (id === participantId && lockedIn);
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
                <span className={done ? "text-green-400" : "text-gray-500"}>
                  {done ? "✓" : "..."}
                </span>
              </div>
            );
          })}
        </div>

      </div>
    </main>
  );
}
