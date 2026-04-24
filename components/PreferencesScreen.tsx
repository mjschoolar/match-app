"use client";
// PreferencesScreen — Pre-swipe step 6 of 6.
//
// Three internal states, one component:
//
//   phase === "preferences"        → private grid selection (up to 3)
//   phase === "preferences"        → waiting state (after locking in)
//   phase === "preferences-reveal" → simultaneous reveal on all devices at once
//
// Key mechanic: selections are fully private during voting. Nobody sees
// anyone else's choices. When the last person locks in, Firebase writes
// "preferences-reveal" — every device gets that update simultaneously
// and renders the reveal at the exact same moment.
//
// The reveal is personalised: each device shows "You" for their own picks
// and actual names for everyone else's.

import { useState } from "react";
import { db } from "@/lib/firebase";
import { ref, set, get } from "firebase/database";
import { Session } from "@/lib/types";
import { CUISINES } from "@/lib/constants";

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

export default function PreferencesScreen({ sessionId, session, participantId }: Props) {
  const [selections, setSelections] = useState<string[]>([]);
  const [lockedIn, setLockedIn] = useState(false);

  const isReveal = session.phase === "preferences-reveal";
  const isCreator = session.creatorId === participantId;
  const participants = Object.entries(session.participants || {});
  const prefResponses = session.responses?.preferences || {};
  const preferencesDone = session.responses?.preferencesDone || {};
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";
  const totalParticipants = participants.length;

  // Collect all vetoed cuisines from the veto step — these are greyed out here
  const vetoResponses = session.responses?.veto || {};
  const allVetoed = new Set<string>(
    Object.values(vetoResponses).flatMap((v) => (Array.isArray(v) ? v : []))
  );

  const iAmDone = lockedIn || !!preferencesDone[participantId];

  function toggleCuisine(id: string) {
    if (iAmDone || isReveal || allVetoed.has(id)) return;

    setSelections((prev) => {
      if (prev.includes(id)) return prev.filter((s) => s !== id);
      if (prev.length >= 3) return prev; // hard cap at 3
      return [...prev, id];
    });
  }

  async function handleLockIn() {
    setLockedIn(true);

    // Write selections if non-empty (Firebase drops empty arrays)
    if (selections.length > 0) {
      await set(
        ref(db, `sessions/${sessionId}/responses/preferences/${participantId}`),
        selections
      );
    }

    // Mark as done
    await set(
      ref(db, `sessions/${sessionId}/responses/preferencesDone/${participantId}`),
      true
    );

    // Fresh read to avoid race condition — if two people lock in simultaneously,
    // stale local state would cause both to see only themselves as done.
    const allIds = Object.keys(session.participants || {});
    const snap = await get(ref(db, `sessions/${sessionId}/responses/preferencesDone`));
    const current = snap.val() || {};
    const allDone = allIds.every((id) => current[id] === true);

    if (allDone) {
      await set(ref(db, `sessions/${sessionId}/phase`), "preferences-reveal");
    }
  }

  async function handleStartSwipe() {
    await set(ref(db, `sessions/${sessionId}/phase`), "swipe");
  }

  // Build reveal data: shared picks (2+ people) and solo picks (1 person)
  function getRevealData() {
    const counts: Record<string, string[]> = {}; // cuisineId → [participantIds]
    for (const [pid, prefs] of Object.entries(prefResponses)) {
      if (!Array.isArray(prefs)) continue;
      for (const cuisineId of prefs) {
        if (!counts[cuisineId]) counts[cuisineId] = [];
        counts[cuisineId].push(pid);
      }
    }

    const shared: { cuisineId: string; pids: string[] }[] = [];
    const solo: { cuisineId: string; pid: string }[] = [];

    for (const [cuisineId, pids] of Object.entries(counts)) {
      if (pids.length >= 2) shared.push({ cuisineId, pids });
      else solo.push({ cuisineId, pid: pids[0] });
    }

    return { shared, solo };
  }

  function cuisineLabel(id: string) {
    return CUISINES.find((c) => c.id === id)?.label ?? id;
  }

  // Show "You" for this device's participant, real names for everyone else
  function displayName(pid: string) {
    return pid === participantId ? "You" : session.participants[pid]?.name ?? pid;
  }

  // Shared section header — adapts to group size vs how many agreed
  function sharedHeader(count: number) {
    if (count === totalParticipants) return "You all want this";
    if (totalParticipants === 2) return "You both want this";
    return "Some of you want this";
  }

  const { shared, solo } = isReveal ? getRevealData() : { shared: [], solo: [] };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        {/* ── SELECTION STATE ── */}
        {!isReveal && !iAmDone && (
          <>
            <div>
              <h2 className="text-2xl font-semibold text-center leading-snug">
                What are you feeling tonight?
              </h2>
              <p className="text-gray-400 text-sm text-center mt-1">
                Pick up to 3. Only you can see this.
              </p>
            </div>

            {/* Selection counter */}
            <p className="text-center text-sm text-gray-400">
              {selections.length === 0 && "Nothing selected yet"}
              {selections.length === 1 && "1 of 3 picked"}
              {selections.length === 2 && "2 of 3 picked"}
              {selections.length === 3 && "3 of 3 — locked and loaded"}
            </p>

            {/* Cuisine grid */}
            <div className="grid grid-cols-3 gap-2">
              {CUISINES.map((cuisine) => {
                const vetoed = allVetoed.has(cuisine.id);
                const selected = selections.includes(cuisine.id);
                const atMax = selections.length >= 3 && !selected;

                return (
                  <button
                    key={cuisine.id}
                    onClick={() => toggleCuisine(cuisine.id)}
                    disabled={vetoed || atMax}
                    className={[
                      "py-3 px-2 rounded-xl text-sm font-medium transition-colors touch-manipulation",
                      vetoed
                        ? "bg-gray-900 text-gray-700 line-through cursor-not-allowed"
                        : selected
                        ? "bg-white text-gray-950 cursor-pointer"
                        : atMax
                        ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer",
                    ].join(" ")}
                  >
                    {cuisine.label}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleLockIn}
              className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
            >
              {selections.length === 0 ? "Anything works for me" : "Lock in"}
            </button>
          </>
        )}

        {/* ── WAITING STATE (after locking in, before reveal fires) ── */}
        {!isReveal && iAmDone && (
          <>
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-semibold">You&apos;re locked in.</h2>
              <p className="text-gray-400 text-sm">Waiting for the others...</p>
            </div>

            <div className="space-y-2">
              {participants.map(([id, participant]) => {
                const done =
                  !!preferencesDone[id] || (id === participantId && lockedIn);
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
          </>
        )}

        {/* ── REVEAL STATE — fires simultaneously on all devices ── */}
        {isReveal && (
          <>
            {/* Shared picks */}
            {shared.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 text-center uppercase tracking-widest">
                  {sharedHeader(shared[0]?.pids.length ?? 0)}
                </p>
                {shared.map(({ cuisineId, pids }) => (
                  <div
                    key={cuisineId}
                    className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 flex justify-between items-center"
                  >
                    <span className="font-semibold text-lg">{cuisineLabel(cuisineId)}</span>
                    <span className="text-gray-300 text-sm">
                      {pids.map(displayName).join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Solo picks */}
            {solo.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 text-center uppercase tracking-widest mt-2">
                  Just one of you
                </p>
                {solo.map(({ cuisineId, pid }) => (
                  <div
                    key={cuisineId}
                    className="bg-gray-800 rounded-xl px-4 py-3 flex justify-between items-center"
                  >
                    <span className="font-medium">{cuisineLabel(cuisineId)}</span>
                    <span className="text-gray-400 text-sm">{displayName(pid)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Nobody picked anything */}
            {shared.length === 0 && solo.length === 0 && (
              <p className="text-center text-gray-400">
                No preferences — anything goes tonight.
              </p>
            )}

            {/* Advance to swipe — creator only */}
            {isCreator ? (
              <button
                onClick={handleStartSwipe}
                className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation mt-2"
              >
                Let&apos;s find out
              </button>
            ) : (
              <p className="text-center text-gray-400 text-sm">
                Waiting for {creatorName} to start the swipe...
              </p>
            )}
          </>
        )}

      </div>
    </main>
  );
}
