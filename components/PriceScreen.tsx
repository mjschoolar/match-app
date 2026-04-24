"use client";
// PriceScreen — Pre-swipe step 3 of 6.
//
// Each participant picks a price tier: $, $$, $$$, or $$$$.
// Same pattern as dine-in — tap to vote, responses appear live,
// last vote triggers the reveal phase on all devices.
//
// Tie-breaking: we use the most common (mode) tier. If there's
// a tie, we take the more affordable option.

import { db } from "@/lib/firebase";
import { ref, set, get } from "firebase/database";
import { Session } from "@/lib/types";

const PRICE_TIERS = ["$", "$$", "$$$", "$$$$"] as const;
type PriceTier = (typeof PRICE_TIERS)[number];

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

export default function PriceScreen({ sessionId, session, participantId }: Props) {
  const isReveal = session.phase === "price-reveal";
  const isCreator = session.creatorId === participantId;
  const participants = Object.entries(session.participants || {});
  const responses = session.responses?.price || {};
  const myResponse = responses[participantId] as PriceTier | undefined;
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  async function handleVote(tier: PriceTier) {
    await set(
      ref(db, `sessions/${sessionId}/responses/price/${participantId}`),
      tier
    );

    // Fresh read to avoid race condition
    const allIds = Object.keys(session.participants || {});
    const snap = await get(ref(db, `sessions/${sessionId}/responses/price`));
    const current = snap.val() || {};
    const allVoted = allIds.every((id) => current[id] !== undefined);

    if (allVoted) {
      await set(ref(db, `sessions/${sessionId}/phase`), "price-reveal");
    }
  }

  async function handleContinue() {
    await set(ref(db, `sessions/${sessionId}/phase`), "veto");
  }

  // Find the most common tier. On a tie, pick the more affordable one.
  function getGroupTier(): PriceTier {
    const votes = Object.values(responses) as PriceTier[];
    const counts: Record<string, number> = {};
    for (const v of votes) counts[v] = (counts[v] || 0) + 1;
    // Sort by count desc, then by tier index asc (cheaper wins ties)
    return PRICE_TIERS.slice()
      .sort((a, b) => {
        const diff = (counts[b] || 0) - (counts[a] || 0);
        return diff !== 0 ? diff : PRICE_TIERS.indexOf(a) - PRICE_TIERS.indexOf(b);
      })[0];
  }

  function getSummary(): string {
    const tier = getGroupTier();
    const votes = Object.values(responses) as PriceTier[];
    const allSame = votes.every((v) => v === tier);
    const labels: Record<PriceTier, string> = {
      "$": "a casual night",
      "$$": "a mid-range night",
      "$$$": "a nicer night",
      "$$$$": "a splurge night",
    };
    const prefix = allSame ? "Everyone's in for" : "Mostly";
    return allSame
      ? `${prefix} ${labels[tier]} — looking at ${tier} options.`
      : `${prefix} ${labels[tier]} — looking at ${tier} options.`;
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        <h2 className="text-2xl font-semibold text-center leading-snug">
          What kind of night is it?
        </h2>

        {/* Price tier selector — only shown before this participant has voted */}
        {!isReveal && !myResponse && (
          <div className="grid grid-cols-4 gap-2">
            {PRICE_TIERS.map((tier) => (
              <button
                key={tier}
                onClick={() => handleVote(tier)}
                className="py-5 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
              >
                {tier}
              </button>
            ))}
          </div>
        )}

        {/* Waiting message after submitting, before reveal */}
        {!isReveal && myResponse && (
          <div className="bg-gray-800 rounded-2xl p-4 text-center">
            <p className="text-gray-400 text-sm">
              You picked <span className="text-white font-semibold">{myResponse}</span> — waiting for others...
            </p>
          </div>
        )}

        {/* Live response list */}
        <div className="space-y-2">
          {participants.map(([id, participant]) => {
            const response = responses[id] as PriceTier | undefined;
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
                  {response ? `✓ ${response}` : "..."}
                </span>
              </div>
            );
          })}
        </div>

        {/* Reveal: summary */}
        {isReveal && (
          <p className="text-center text-lg font-medium pt-2">{getSummary()}</p>
        )}

        {/* Reveal: creator Continue */}
        {isReveal && isCreator && (
          <button
            onClick={handleContinue}
            className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
          >
            Continue
          </button>
        )}

        {/* Reveal: joiner waiting */}
        {isReveal && !isCreator && (
          <p className="text-center text-gray-400 text-sm pt-2">
            Waiting for {creatorName} to continue...
          </p>
        )}

      </div>
    </main>
  );
}
