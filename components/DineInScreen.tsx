"use client";
// DineInScreen — Pre-swipe step 1 of 6.
//
// V2 changes:
//   - Count badges on buttons during voting (no named attribution until reveal)
//   - Buttons stay visible in locked state after voting — not hidden
//   - 1000ms delay before phase advances on the last vote (anticipation beat)
//   - Fixed reveal copy for all-dine-in case ("We're eating in" not "going out")

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
  const totalParticipants = participants.length;
  const responses = session.responses?.dineIn || {};
  const myResponse = responses[participantId];
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  // Live counts for the badge display — updates as Firebase pushes new responses
  const dineInCount = Object.values(responses).filter((v) => v === "dine-in").length;
  const deliveryCount = Object.values(responses).filter((v) => v === "delivery").length;
  const totalResponded = dineInCount + deliveryCount;

  async function handleVote(choice: "dine-in" | "delivery") {
    if (myResponse) return; // guard against double-tap

    await set(
      ref(db, `sessions/${sessionId}/responses/dineIn/${participantId}`),
      choice
    );

    // Fresh read from Firebase to avoid race condition
    const allIds = Object.keys(session.participants || {});
    const snap = await get(ref(db, `sessions/${sessionId}/responses/dineIn`));
    const current = snap.val() || {};
    const allVoted = allIds.every((id) => current[id] !== undefined);

    if (allVoted) {
      // Brief pause before the reveal — creates a beat of anticipation
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await set(ref(db, `sessions/${sessionId}/phase`), "dine-in-reveal");
    }
  }

  async function handleContinue() {
    await set(ref(db, `sessions/${sessionId}/phase`), "distance");
  }

  // Reveal summary copy — correctly handles the all-dine-in case
  function getSummary() {
    const votes = Object.values(responses) as string[];
    const total = votes.length;
    const dineInVotes = votes.filter((v) => v === "dine-in").length;

    if (dineInVotes === total) return "We're eating in tonight.";
    if (dineInVotes === 0) return "We're going out tonight.";
    if (dineInVotes > total / 2) return "Mostly going out — we'll look at dine-in spots.";
    if (dineInVotes < total / 2) return "Mostly staying in — we'll look at delivery options.";
    return "It's a split — we'll look at dine-in spots.";
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        <h2 className="text-2xl font-semibold text-center leading-snug">
          Going out or staying in?
        </h2>

        {/* ── VOTING STATE — buttons with live count badges ── */}
        {!isReveal && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {/* Dine in button */}
              <button
                onClick={() => handleVote("dine-in")}
                disabled={!!myResponse}
                className={[
                  "py-5 rounded-2xl font-semibold text-lg touch-manipulation transition-colors",
                  myResponse === "dine-in"
                    ? "bg-white text-gray-950 cursor-default"                              // my pick
                    : myResponse
                    ? "bg-gray-800 text-gray-600 cursor-default"                           // I voted elsewhere
                    : dineInCount > 0
                    ? "bg-gray-700 text-gray-100 border border-white/20 cursor-pointer"    // others picked it
                    : "bg-gray-800 text-white hover:bg-gray-700 cursor-pointer",           // nobody yet
                ].join(" ")}
              >
                Dine in
                <span className="ml-2 text-sm font-normal opacity-50">
                  ({dineInCount})
                </span>
              </button>

              {/* Delivery button */}
              <button
                onClick={() => handleVote("delivery")}
                disabled={!!myResponse}
                className={[
                  "py-5 rounded-2xl font-semibold text-lg touch-manipulation transition-colors",
                  myResponse === "delivery"
                    ? "bg-white text-gray-950 cursor-default"
                    : myResponse
                    ? "bg-gray-800 text-gray-600 cursor-default"
                    : deliveryCount > 0
                    ? "bg-gray-700 text-gray-100 border border-white/20 cursor-pointer"
                    : "bg-gray-800 text-white hover:bg-gray-700 cursor-pointer",
                ].join(" ")}
              >
                Delivery
                <span className="ml-2 text-sm font-normal opacity-50">
                  ({deliveryCount})
                </span>
              </button>
            </div>

            {/* Response progress — no names, just count */}
            <p className="text-center text-sm text-gray-400">
              {myResponse
                ? `Locked in ✓  ·  ${totalResponded} of ${totalParticipants} responded`
                : `${totalResponded} of ${totalParticipants} responded`}
            </p>
          </>
        )}

        {/* ── REVEAL STATE — full attribution list ── */}
        {isReveal && (
          <>
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

            <p className="text-center text-lg font-medium pt-2">{getSummary()}</p>

            {isCreator && (
              <button
                onClick={handleContinue}
                className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
              >
                Continue
              </button>
            )}

            {!isCreator && (
              <p className="text-center text-gray-400 text-sm pt-2">
                Waiting for {creatorName} to continue...
              </p>
            )}
          </>
        )}

      </div>
    </main>
  );
}
