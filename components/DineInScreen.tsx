"use client";
// DineInScreen — Pre-swipe step 1 of 6.
//
// Two internal states, one component:
//   phase === "dine-in"        → question + vote buttons + live response list
//   phase === "dine-in-reveal" → full response list + summary + creator's Continue
//
// Voting logic: when a participant votes, their choice is written to Firebase.
// Then we check if every participant now has a response. If so, we write the
// reveal phase — which triggers a re-render on all devices simultaneously.

import { db } from "@/lib/firebase";
import { ref, set, get } from "firebase/database";
import { Session } from "@/lib/types";

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

export default function DineInScreen({ sessionId, session, participantId }: Props) {
  const isReveal = session.phase === "dine-in-reveal";
  const isCreator = session.creatorId === participantId;
  const participants = Object.entries(session.participants || {});
  const responses = session.responses?.dineIn || {};
  const myResponse = responses[participantId];
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  async function handleVote(choice: "dine-in" | "delivery") {
    // Write this participant's vote to Firebase
    await set(
      ref(db, `sessions/${sessionId}/responses/dineIn/${participantId}`),
      choice
    );

    // Fresh read from Firebase to avoid race condition: if two people submit
    // at nearly the same moment, stale local state could cause both to see
    // only themselves as done and neither would advance the phase.
    const allIds = Object.keys(session.participants || {});
    const snap = await get(ref(db, `sessions/${sessionId}/responses/dineIn`));
    const current = snap.val() || {};
    const allVoted = allIds.every((id) => current[id] !== undefined);

    if (allVoted) {
      await set(ref(db, `sessions/${sessionId}/phase`), "dine-in-reveal");
    }
  }

  async function handleContinue() {
    await set(ref(db, `sessions/${sessionId}/phase`), "distance");
  }

  // Generate a plain-English summary of how the group voted.
  // Used on the reveal screen.
  function getSummary() {
    const votes = Object.values(responses) as string[];
    const total = votes.length;
    const dineInCount = votes.filter((v) => v === "dine-in").length;

    if (dineInCount === total) return "Everyone's going out.";
    if (dineInCount === 0) return "Everyone's staying in — let's find delivery.";
    if (dineInCount > total / 2) return "Mostly going out — we'll look at dine-in spots.";
    if (dineInCount < total / 2) return "Mostly staying in — we'll look at delivery options.";
    return "It's a split — we'll look at dine-in spots."; // exact tie
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        <h2 className="text-2xl font-semibold text-center leading-snug">
          Going out or staying in?
        </h2>

        {/* Vote buttons — only shown before this participant has voted */}
        {!isReveal && !myResponse && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleVote("dine-in")}
              className="py-5 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
            >
              Dine in
            </button>
            <button
              onClick={() => handleVote("delivery")}
              className="py-5 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
            >
              Delivery
            </button>
          </div>
        )}

        {/* Live response list — visible throughout both states */}
        <div className="space-y-2">
          {participants.map(([id, participant]) => {
            const response = responses[id] as string | undefined;
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
                <span className={response ? "text-green-400" : "text-gray-500"}>
                  {response
                    ? `✓ ${response === "dine-in" ? "Dine in" : "Delivery"}`
                    : "..."}
                </span>
              </div>
            );
          })}
        </div>

        {/* Reveal: summary line */}
        {isReveal && (
          <p className="text-center text-lg font-medium pt-2">{getSummary()}</p>
        )}

        {/* Reveal: creator's Continue button */}
        {isReveal && isCreator && (
          <button
            onClick={handleContinue}
            className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
          >
            Continue
          </button>
        )}

        {/* Reveal: joiner waiting message */}
        {isReveal && !isCreator && (
          <p className="text-center text-gray-400 text-sm pt-2">
            Waiting for {creatorName} to continue...
          </p>
        )}

      </div>
    </main>
  );
}
