"use client";
// VetoScreen — Pre-swipe step 4 of 6.
//
// V2 changes:
//   - During voting: tiles show a count badge (how many picked it) but no names.
//     Attribution appears only at the reveal.
//   - Removed the live named-attribution list. Replaced with a simple
//     "N of X done" completion indicator.
//   - Reveal is unchanged — full attribution still shown there.
//
// Why vetoDone exists: Firebase can't store an empty array (it treats it as
// null and removes the node). Without a separate "done" flag we can't tell
// the difference between "chose no vetoes" and "hasn't responded yet".

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

export default function VetoScreen({ sessionId, session, participantId }: Props) {
  const isReveal = session.phase === "veto-reveal";
  const isCreator = session.creatorId === participantId;
  const participants = Object.entries(session.participants || {});
  const totalParticipants = participants.length;
  const vetoResponses = session.responses?.veto || {};
  const vetoDone = session.responses?.vetoDone || {};
  const iAmDone = !!vetoDone[participantId];
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  const totalDone = Object.values(vetoDone).filter(Boolean).length;

  // Local state keeps the grid snappy — taps feel instant while Firebase syncs
  const [selections, setSelections] = useState<string[]>(
    Array.isArray(vetoResponses[participantId]) ? vetoResponses[participantId] : []
  );

  // How many participants have vetoed a given cuisine (for count badges)
  function vetoCountFor(cuisineId: string): number {
    return Object.values(vetoResponses).filter(
      (v) => Array.isArray(v) && v.includes(cuisineId)
    ).length;
  }

  function toggleCuisine(cuisineId: string) {
    if (iAmDone || isReveal) return;

    const next = selections.includes(cuisineId)
      ? selections.filter((s) => s !== cuisineId)
      : [...selections, cuisineId];

    setSelections(next);

    // Write live to Firebase so others see count updates immediately.
    // If empty, remove the node — Firebase can't store [].
    const vetoRef = ref(db, `sessions/${sessionId}/responses/veto/${participantId}`);
    if (next.length > 0) {
      set(vetoRef, next);
    } else {
      remove(vetoRef);
    }
  }

  async function handleDone() {
    await set(
      ref(db, `sessions/${sessionId}/responses/vetoDone/${participantId}`),
      true
    );

    // Fresh read to avoid race condition
    const allIds = Object.keys(session.participants || {});
    const snap = await get(ref(db, `sessions/${sessionId}/responses/vetoDone`));
    const current = snap.val() || {};
    const allDone = allIds.every((id) => current[id] === true);

    if (allDone) {
      await set(ref(db, `sessions/${sessionId}/phase`), "veto-reveal");
    }
  }

  async function handleContinue() {
    await set(ref(db, `sessions/${sessionId}/phase`), "preferences");
  }

  // For the reveal: build a map of cuisineId → [names who vetoed it]
  function getRevealByCuisine(): Record<string, string[]> {
    const byCuisine: Record<string, string[]> = {};
    for (const [pid, vetoes] of Object.entries(vetoResponses)) {
      if (!Array.isArray(vetoes)) continue;
      for (const cuisineId of vetoes) {
        if (!byCuisine[cuisineId]) byCuisine[cuisineId] = [];
        const name = session.participants[pid]?.name ?? pid;
        byCuisine[cuisineId].push(name);
      }
    }
    return byCuisine;
  }

  function cuisineLabel(id: string): string {
    return CUISINES.find((c) => c.id === id)?.label ?? id;
  }

  const revealByCuisine = isReveal ? getRevealByCuisine() : {};
  const vetoedCuisines = Object.keys(revealByCuisine);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        <div>
          <h2 className="text-2xl font-semibold text-center leading-snug">
            {isReveal ? "Off the table tonight" : "Anything off the table tonight?"}
          </h2>
          {!isReveal && (
            <p className="text-gray-400 text-sm text-center mt-1">
              Tap anything you don&apos;t want tonight.
            </p>
          )}
        </div>

        {/* ── VOTING STATE ── */}
        {!isReveal && (
          <>
            {/* Cuisine grid — tiles show count badges, not names */}
            <div className="grid grid-cols-3 gap-2">
              {CUISINES.map((cuisine) => {
                const selected = selections.includes(cuisine.id);
                const count = vetoCountFor(cuisine.id);

                return (
                  <button
                    key={cuisine.id}
                    onClick={() => toggleCuisine(cuisine.id)}
                    disabled={iAmDone}
                    className={[
                      "py-3 px-2 rounded-xl text-sm font-medium touch-manipulation transition-colors relative",
                      selected
                        ? "bg-red-500/20 text-red-300 border border-red-500/40"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700",
                      iAmDone ? "opacity-60 cursor-default" : "cursor-pointer",
                    ].join(" ")}
                  >
                    {selected && <span className="mr-1">✕</span>}
                    {cuisine.label}
                    {/* Count badge — shows when anyone has vetoed this cuisine */}
                    {count > 0 && (
                      <span className={[
                        "ml-1 text-xs font-normal",
                        selected ? "text-red-400" : "text-gray-500",
                      ].join(" ")}>
                        ({count})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Completion progress — no attribution, just a count */}
            <p className="text-center text-sm text-gray-400">
              {iAmDone
                ? `Done ✓  ·  ${totalDone} of ${totalParticipants} finished`
                : `${totalDone} of ${totalParticipants} finished`}
            </p>

            {/* Done button — hidden after submitting */}
            {!iAmDone && (
              <button
                onClick={handleDone}
                className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
              >
                {selections.length > 0
                  ? `Veto ${selections.length} cuisine${selections.length > 1 ? "s" : ""}`
                  : "Nothing to veto — I'm good"}
              </button>
            )}
          </>
        )}

        {/* ── REVEAL STATE — full attribution ── */}
        {isReveal && (
          <>
            {vetoedCuisines.length === 0 ? (
              <p className="text-center text-gray-300">
                Nothing vetoed — everything&apos;s fair game tonight.
              </p>
            ) : (
              <div className="space-y-3">
                {vetoedCuisines.map((cuisineId) => {
                  const names = revealByCuisine[cuisineId];
                  return (
                    <div
                      key={cuisineId}
                      className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3"
                    >
                      <span className="font-medium text-red-300">
                        ✕ {cuisineLabel(cuisineId)}
                      </span>
                      <span className="text-gray-400 text-sm">{names.join(", ")}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-center text-gray-400 text-sm">
              {vetoedCuisines.length > 0
                ? "Everything else is fair game."
                : "The full menu is open."}
            </p>

            {isCreator && (
              <button
                onClick={handleContinue}
                className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
              >
                Continue
              </button>
            )}

            {!isCreator && (
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
