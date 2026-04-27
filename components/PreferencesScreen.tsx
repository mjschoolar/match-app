"use client";
// PreferencesScreen — Pre-swipe step 5 of 6.
//
// Three internal states, one component:
//   phase === "preferences"        → grid selection (accumulation visible, up to 3 picks)
//   phase === "preferences"        → waiting state after locking in (grid still visible)
//   phase === "preferences-reveal" → simultaneous three-zone reveal on all devices
//
// V2 changes:
//   - Selections write to Firebase on every tap (not just on lock-in) so tile
//     counts accumulate live for everyone to see — same pattern as veto.
//   - Tile visual hierarchy: your picks (most prominent) → others' picks (count badge,
//     less prominent) → no picks (default).
//   - After locking in: grid stays visible in locked state with the hierarchy intact.
//     Completion list shown below (who's done ✓ vs still going ...).
//   - Reveal: three zones — shared (2+ people), solo (1 person), open to anything.
//     Every participant appears. No one is invisible.
//
// The reveal is personalised: each device shows "You" for their own picks
// and actual names for everyone else's.

import { useState } from "react";
import { db } from "@/lib/firebase";
import { ref, set, get, remove } from "firebase/database";
import { Session } from "@/lib/types";
import { CUISINES } from "@/lib/constants";

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

export default function PreferencesScreen({ sessionId, session, participantId }: Props) {
  const [lockedIn, setLockedIn] = useState(false);

  const isReveal = session.phase === "preferences-reveal";
  const isCreator = session.creatorId === participantId;
  const participants = Object.entries(session.participants || {});
  const totalParticipants = participants.length;
  const prefResponses = session.responses?.preferences || {};
  const preferencesDone = session.responses?.preferencesDone || {};
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  // Local state for instant tap feedback — Firebase data used for count badges
  const [localSelections, setLocalSelections] = useState<string[]>(() =>
    Array.isArray(prefResponses[participantId]) ? prefResponses[participantId] : []
  );

  const iAmDone = lockedIn || !!preferencesDone[participantId];

  // How many OTHER participants (not me) have selected a given cuisine
  // Used for the count badge — doesn't reveal your own picks to yourself
  function othersPickCountFor(cuisineId: string): number {
    return Object.entries(prefResponses)
      .filter(([pid, v]) => pid !== participantId && Array.isArray(v) && (v as string[]).includes(cuisineId))
      .length;
  }

  function toggleCuisine(id: string) {
    if (iAmDone || isReveal) return;

    const isSelected = localSelections.includes(id);

    const next = isSelected
      ? localSelections.filter((s) => s !== id)
      : [...localSelections, id];

    // Update local state instantly — feels snappy, no Firebase round-trip lag
    setLocalSelections(next);

    // Write to Firebase in background — others see count updates
    const prefRef = ref(db, `sessions/${sessionId}/responses/preferences/${participantId}`);
    if (next.length > 0) {
      set(prefRef, next);
    } else {
      remove(prefRef);
    }
  }

  async function handleLockIn() {
    setLockedIn(true);

    // Mark as done
    await set(
      ref(db, `sessions/${sessionId}/responses/preferencesDone/${participantId}`),
      true
    );

    // Fresh read to avoid race condition
    const allIds = Object.keys(session.participants || {});
    const snap = await get(ref(db, `sessions/${sessionId}/responses/preferencesDone`));
    const current = snap.val() || {};
    const allDone = allIds.every((id) => current[id] === true);

    if (allDone) {
      await set(ref(db, `sessions/${sessionId}/phase`), "preferences-reveal");
    }
  }

  async function handleAdvance() {
    await set(ref(db, `sessions/${sessionId}/phase`), "veto");
  }

  // ── Reveal data helpers ──────────────────────────────────────────────────

  function getRevealData() {
    const counts: Record<string, string[]> = {}; // cuisineId → [participantIds who picked it]
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

    // Participants who made no selection at all
    const pickedAnything = new Set(
      Object.entries(prefResponses)
        .filter(([, v]) => Array.isArray(v) && (v as string[]).length > 0)
        .map(([pid]) => pid)
    );
    const openToAnything = participants
      .filter(([id]) => !pickedAnything.has(id))
      .map(([id]) => id);

    return { shared, solo, openToAnything };
  }

  function cuisineLabel(id: string) {
    return CUISINES.find((c) => c.id === id)?.label ?? id;
  }

  function displayName(pid: string) {
    return pid === participantId ? "You" : session.participants[pid]?.name ?? pid;
  }

  function sharedHeader(pidsLength: number) {
    if (pidsLength === totalParticipants) return "You all want this";
    if (totalParticipants === 2) return "You both want this";
    return "Some of you want this";
  }

  const { shared, solo, openToAnything } = isReveal
    ? getRevealData()
    : { shared: [], solo: [], openToAnything: [] };

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        {/* ── SELECTION + WAITING STATE ── */}
        {!isReveal && (
          <>
            <div>
              <h2 className="text-2xl font-semibold text-center leading-snug">
                What are you feeling tonight?
              </h2>
              <p className="text-gray-400 text-sm text-center mt-1">
                {iAmDone
                  ? "Locked in ✓"
                  : "Only you can see which are yours."}
              </p>
            </div>

            {/* Selection counter */}
            {!iAmDone && (
              <p className="text-center text-sm text-gray-400">
                {localSelections.length === 0
                  ? "Nothing selected yet"
                  : `${localSelections.length} selected`}
              </p>
            )}

            {/* Cuisine grid — accumulation visible */}
            <div className="grid grid-cols-3 gap-2">
              {CUISINES.map((cuisine) => {
                const iMine = localSelections.includes(cuisine.id);
                const othersCount = othersPickCountFor(cuisine.id);

                return (
                  <button
                    key={cuisine.id}
                    onClick={() => toggleCuisine(cuisine.id)}
                    disabled={iAmDone}
                    className={[
                      "py-3 px-2 rounded-xl text-sm font-medium transition-colors touch-manipulation",
                      iMine
                        ? "bg-green-500/20 text-green-300 border border-green-500/40 cursor-pointer"
                        : othersCount > 0
                        ? "bg-green-500/10 text-green-300/70 border border-green-500/20 cursor-pointer"
                        : iAmDone
                        ? "bg-gray-800 text-gray-600 cursor-default"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer",
                    ].join(" ")}
                  >
                    {(iMine || othersCount > 0) && <span className="mr-1">✓</span>}
                    {cuisine.label}
                    {othersCount > 1 && (
                      <span className="ml-1 text-xs font-normal opacity-60">
                        ({othersCount})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Lock in button — only shown before locking in */}
            {!iAmDone && (
              <button
                onClick={handleLockIn}
                className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
              >
                {localSelections.length === 0 ? "Anything works for me" : "Lock in"}
              </button>
            )}

            {/* Completion list — who's done vs still going */}
            <div className="space-y-2">
              {participants.map(([id, participant]) => {
                const done = !!preferencesDone[id] || (id === participantId && lockedIn);
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

        {/* ── REVEAL STATE — three zones, fires simultaneously on all devices ── */}
        {isReveal && (
          <>
            {/* Zone 1: Shared picks (2+ people) */}
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

            {/* Zone 2: Solo picks (exactly 1 person) */}
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

            {/* Zone 3: Open to anything — participants who made no selection */}
            {openToAnything.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 text-center uppercase tracking-widest mt-2">
                  Open to anything
                </p>
                <div className="bg-gray-800 rounded-xl px-4 py-3">
                  <span className="text-gray-300 text-sm">
                    {openToAnything.map(displayName).join(", ")}
                  </span>
                  <p className="text-gray-500 text-xs mt-0.5">open to anything tonight</p>
                </div>
              </div>
            )}

            {/* Fallback: nobody picked anything */}
            {shared.length === 0 && solo.length === 0 && openToAnything.length === 0 && (
              <p className="text-center text-gray-400">
                No preferences — anything goes tonight.
              </p>
            )}

            {/* Advance to dietary — creator only */}
            {isCreator ? (
              <button
                onClick={handleAdvance}
                className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation mt-2"
              >
                Let&apos;s find out
              </button>
            ) : (
              <p className="text-center text-gray-400 text-sm">
                Waiting for {creatorName} to continue...
              </p>
            )}
          </>
        )}

      </div>
    </main>
  );
}
