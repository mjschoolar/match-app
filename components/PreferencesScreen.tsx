"use client";
// PreferencesScreen — V4 combined reveal (preferences-reveal phase only).
//
// Reads from both preferencesPositive and preferencesNegative.
// Three-zone layout for positive picks (shared, solo, open to anything),
// followed by a negative section showing what people wanted to skip.
// Fires simultaneously on all devices when phase === "preferences-reveal".
// Creator Continue → generating-stack (veto step returns in V4.1).

import { db } from "@/lib/firebase";
import { ref, set } from "firebase/database";
import { Session } from "@/lib/types";
import { CUISINES } from "@/lib/constants";

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

export default function PreferencesScreen({ sessionId, session, participantId }: Props) {
  const isCreator = session.creatorId === participantId;
  const participants = Object.entries(session.participants || {});
  const totalParticipants = participants.length;
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  const prefPositiveResponses = session.responses?.preferencesPositive || {};
  const prefNegativeResponses = session.responses?.preferencesNegative || {};

  async function handleContinue() {
    // V4 temporary: goes directly to generating-stack. Veto step returns in V4.1.
    await set(ref(db, `sessions/${sessionId}/phase`), "generating-stack");
  }

  function cuisineLabel(id: string) {
    return CUISINES.find((c) => c.id === id)?.label ?? id;
  }

  function displayName(pid: string) {
    return pid === participantId ? "You" : session.participants[pid]?.name ?? pid;
  }

  // ── Positive picks analysis ──────────────────────────────────────────────

  const positiveCounts: Record<string, string[]> = {};
  for (const [pid, prefs] of Object.entries(prefPositiveResponses)) {
    if (!Array.isArray(prefs)) continue;
    for (const cuisineId of prefs) {
      if (!positiveCounts[cuisineId]) positiveCounts[cuisineId] = [];
      positiveCounts[cuisineId].push(pid);
    }
  }

  const shared: { cuisineId: string; pids: string[] }[] = [];
  const solo: { cuisineId: string; pid: string }[] = [];

  for (const [cuisineId, pids] of Object.entries(positiveCounts)) {
    if (pids.length >= 2) shared.push({ cuisineId, pids });
    else solo.push({ cuisineId, pid: pids[0] });
  }

  const pickedAnythingPositive = new Set(
    Object.entries(prefPositiveResponses)
      .filter(([, v]) => Array.isArray(v) && (v as string[]).length > 0)
      .map(([pid]) => pid)
  );
  const openToAnything = participants
    .filter(([id]) => !pickedAnythingPositive.has(id))
    .map(([id]) => id);

  // ── Negative picks analysis ──────────────────────────────────────────────

  const skippedBy: Record<string, string[]> = {};
  for (const [pid, prefs] of Object.entries(prefNegativeResponses)) {
    if (!Array.isArray(prefs)) continue;
    for (const cuisineId of prefs) {
      if (!skippedBy[cuisineId]) skippedBy[cuisineId] = [];
      skippedBy[cuisineId].push(pid);
    }
  }
  const hasNegatives = Object.keys(skippedBy).length > 0;

  function sharedHeader(pidsLength: number) {
    if (pidsLength === totalParticipants) return "You all want this";
    if (totalParticipants === 2) return "You both want this";
    return "Some of you want this";
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        {/* Zone 1: Shared positive picks (2+ people) */}
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

        {/* Zone 2: Solo positive picks (exactly 1 person) */}
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

        {/* Zone 3: Open to anything */}
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

        {/* Fallback: nobody picked anything positive */}
        {shared.length === 0 && solo.length === 0 && openToAnything.length === 0 && (
          <p className="text-center text-gray-400">
            No preferences — anything goes tonight.
          </p>
        )}

        {/* Negative section: what people wanted to skip */}
        {hasNegatives && (
          <div className="space-y-2 pt-2 border-t border-white/10">
            <p className="text-xs text-gray-400 text-center uppercase tracking-widest">
              Wanted to skip
            </p>
            {Object.entries(skippedBy).map(([cuisineId, pids]) => (
              <div
                key={cuisineId}
                className="bg-gray-800/60 rounded-xl px-4 py-3 flex justify-between items-center"
              >
                <span className="text-gray-300 font-medium">
                  <span className="text-red-400 mr-2">✕</span>
                  {cuisineLabel(cuisineId)}
                </span>
                <span className="text-gray-500 text-sm">
                  {pids.map(displayName).join(", ")}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Continue — creator only */}
        {isCreator ? (
          <button
            onClick={handleContinue}
            className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation mt-2"
          >
            Let&apos;s find out
          </button>
        ) : (
          <p className="text-center text-gray-400 text-sm">
            Waiting for {creatorName} to continue...
          </p>
        )}

      </div>
    </main>
  );
}
