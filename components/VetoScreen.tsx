"use client";
// VetoScreen — V4.1 veto mechanic.
//
// Signal-free individual decision window. No counts, no semi-selected
// states, no social information visible during the decision. Each
// participant gets exactly 1 veto or can pass entirely.
//
// Two-tap confirm flow: tap a tile to stage it, tap the CTA to confirm.
// Tapping the staged tile again deselects it. "Nothing — I'm in" passes.
//
// Firebase writes "pass" instead of null (Firebase drops null nodes).
// Creator sees Continue only after all participants have responded.
// Creator also participates — Continue appears only after their own response.
//
// The vetoable grid is filtered: categories excluded if majority of
// participants marked them negative in the preferences-negative pass.

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { ref, set } from "firebase/database";
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
  const participantCount = participants.length;
  const vetoResponses = session.responses?.veto || {};
  const prefNegativeResponses = session.responses?.preferencesNegative || {};
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  const myResponse = vetoResponses[participantId]; // cuisine ID, "pass", or undefined
  const [pendingVeto, setPendingVeto] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const iAmDone = submitted || myResponse !== undefined;

  // All participants (including creator) have responded
  const allIds = Object.keys(session.participants || {});
  const allResponded = allIds.every((id) => vetoResponses[id] !== undefined);

  // Auto-advance to veto-reveal when everyone has locked in — no host button needed.
  // Only the creator writes the phase change; 500ms delay acts as a small breath.
  useEffect(() => {
    if (!allResponded || isReveal || !isCreator) return;
    const timer = setTimeout(() => {
      handleAdvanceToReveal();
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allResponded, isReveal, isCreator]);

  // Filtered grid: exclude categories that a majority already marked negative
  const threshold = Math.ceil(participantCount / 2);
  const vetoableCuisines = CUISINES.filter((cuisine) => {
    const negativeCount = Object.values(prefNegativeResponses).filter(
      (picks) => Array.isArray(picks) && (picks as string[]).includes(cuisine.id)
    ).length;
    return negativeCount < threshold;
  });

  function handleTileTap(cuisineId: string) {
    if (iAmDone) return;
    setPendingVeto((prev) => (prev === cuisineId ? null : cuisineId));
  }

  async function handleConfirmVeto() {
    if (!pendingVeto || iAmDone) return;
    setSubmitted(true);
    await set(
      ref(db, `sessions/${sessionId}/responses/veto/${participantId}`),
      pendingVeto
    );
  }

  async function handlePass() {
    if (iAmDone) return;
    setSubmitted(true);
    await set(
      ref(db, `sessions/${sessionId}/responses/veto/${participantId}`),
      "pass"
    );
  }

  async function handleAdvanceToReveal() {
    await set(ref(db, `sessions/${sessionId}/phase`), "veto-reveal");
  }

  async function handleAdvanceToStack() {
    await set(ref(db, `sessions/${sessionId}/phase`), "generating-stack");
  }

  function cuisineLabel(id: string) {
    return CUISINES.find((c) => c.id === id)?.label ?? id;
  }

  // The cuisine this participant actually vetoed (post-confirm, from Firebase or local)
  const myVeto = myResponse && myResponse !== "pass" ? myResponse : null;

  // ── REVEAL data ──
  const actualVetoes = Object.entries(vetoResponses).filter(([, v]) => v !== "pass");
  const hasVetoes = actualVetoes.length > 0;

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        {/* ── VETO WINDOW ── */}
        {!isReveal && (
          <>
            {!iAmDone && (
              <div>
                <h2 className="text-2xl font-semibold text-center leading-snug">
                  Anything you want to take off the table?
                </h2>
                <p className="text-gray-400 text-sm text-center mt-1">
                  You have 1 veto.
                </p>
              </div>
            )}

            {iAmDone && (
              <div className="text-center space-y-1">
                <h2 className="text-2xl font-semibold">
                  {myVeto ? `${cuisineLabel(myVeto)} is off the table.` : "You're in."}
                </h2>
                <p className="text-gray-400 text-sm">Waiting for the group.</p>
              </div>
            )}

            {/* Signal-free grid — all tiles look the same until tapped */}
            <div className="grid grid-cols-3 gap-2">
              {vetoableCuisines.map((cuisine) => {
                const isPending = pendingVeto === cuisine.id;
                const isMyVeto = myVeto === cuisine.id;

                return (
                  <button
                    key={cuisine.id}
                    onClick={() => handleTileTap(cuisine.id)}
                    disabled={iAmDone}
                    className={[
                      "py-3 px-2 rounded-xl text-sm font-medium transition-colors touch-manipulation",
                      isMyVeto
                        ? "bg-red-500/20 text-red-300 border border-red-500/40 cursor-default"
                        : isPending
                        ? "bg-red-500/20 text-red-300 border border-red-500/40 cursor-pointer"
                        : iAmDone
                        ? "bg-gray-800 text-gray-600 cursor-default"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700 cursor-pointer",
                    ].join(" ")}
                  >
                    {(isMyVeto || isPending) && <span className="mr-1">✕</span>}
                    {cuisine.label}
                  </button>
                );
              })}
            </div>

            {/* CTA — changes based on pending selection */}
            {!iAmDone && (
              <button
                onClick={pendingVeto ? handleConfirmVeto : handlePass}
                className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
              >
                {pendingVeto
                  ? `${cuisineLabel(pendingVeto)} is off the table`
                  : "Nothing — I'm in"}
              </button>
            )}

            {/* Completion list */}
            <div className="space-y-2">
              {participants.map(([id, participant]) => {
                const done = vetoResponses[id] !== undefined || (id === participantId && submitted);
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

            {/* Auto-advances when everyone locks in — no manual button needed */}
          </>
        )}

        {/* ── REVEAL ── */}
        {isReveal && (
          <>
            {!hasVetoes ? (
              <>
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-semibold">Nobody took anything off the table.</h2>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-semibold text-center">Off the table</h2>
                <div className="space-y-2">
                  {actualVetoes.map(([pid, cuisineId]) => {
                    const name = session.participants[pid]?.name ?? pid;
                    return (
                      <div
                        key={pid}
                        className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3"
                      >
                        <span className="font-medium text-red-300">
                          ✕ {cuisineLabel(cuisineId)}
                        </span>
                        <span className="text-gray-400 text-sm">{name}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {isCreator ? (
              <button
                onClick={handleAdvanceToStack}
                className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
              >
                Build the stack
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
