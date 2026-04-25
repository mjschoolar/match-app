"use client";
// DietaryScreen — Pre-swipe step 6 of 6.
//
// A quiet private moment between the app and each participant individually.
// Nobody sees anyone else's selections — not during, not after. Ever.
//
// There is no reveal phase for dietary. When everyone has submitted,
// the phase jumps straight to "swipe".
//
// The waiting state shows who has finished (✓) vs who hasn't (...),
// but shows nothing about what anyone selected.
//
// Same empty-array workaround as VetoScreen: we use dietaryDone to
// track submission separately from the selections themselves.

import { useState } from "react";
import { db } from "@/lib/firebase";
import { ref, set, get } from "firebase/database";
import { Session } from "@/lib/types";
import { DIETARY } from "@/lib/constants";

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

export default function DietaryScreen({ sessionId, session, participantId }: Props) {
  const [selections, setSelections] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const participants = Object.entries(session.participants || {});
  const dietaryDone = session.responses?.dietaryDone || {};
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  function toggleItem(id: string) {
    if (submitted) return;
    setSelections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  async function handleDone() {
    setSubmitted(true);

    // Write selections privately — only if non-empty (Firebase drops empty arrays)
    if (selections.length > 0) {
      await set(
        ref(db, `sessions/${sessionId}/responses/dietary/${participantId}`),
        selections
      );
    }

    // Mark this participant as done
    await set(
      ref(db, `sessions/${sessionId}/responses/dietaryDone/${participantId}`),
      true
    );

    // Fresh read to avoid race condition
    const allIds = Object.keys(session.participants || {});
    const snap = await get(ref(db, `sessions/${sessionId}/responses/dietaryDone`));
    const current = snap.val() || {};
    const allDone = allIds.every((id) => current[id] === true);

    if (allDone) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await set(ref(db, `sessions/${sessionId}/phase`), "generating-stack");
    }
  }

  // Has this participant submitted (either just now via local state, or
  // from a previous load via Firebase)?
  const iAmDone = submitted || !!dietaryDone[participantId];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        {/* ── SELECTION STATE ── */}
        {!iAmDone && (
          <>
            <div>
              <h2 className="text-2xl font-semibold text-center leading-snug">
                Anything we should know for the stack?
              </h2>
              <p className="text-gray-400 text-sm text-center mt-1">
                Private — nobody else will see this.
              </p>
            </div>
            <div className="space-y-2">
              {DIETARY.map((item) => {
                const selected = selections.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left cursor-pointer touch-manipulation transition-colors
                      ${selected
                        ? "bg-gray-700 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      }
                    `}
                  >
                    <span className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border
                      ${selected ? "bg-white border-white" : "border-gray-500"}`}
                    >
                      {selected && <span className="text-gray-950 text-xs font-bold">✓</span>}
                    </span>
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleDone}
              className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
            >
              {selections.length > 0 ? "Got it" : "None for me"}
            </button>
          </>
        )}

        {/* ── WAITING STATE ── */}
        {iAmDone && (
          <>
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-semibold">You&apos;re all set.</h2>
              <p className="text-gray-400 text-sm">
                Everything&apos;s locked in — your stack is on the way.
              </p>
            </div>

            {/* Who's ready — names only, no selections shown */}
            <div className="space-y-2">
              {participants.map(([id, participant]) => {
                const done = !!dietaryDone[id] || (id === participantId && submitted);
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

      </div>
    </main>
  );
}
