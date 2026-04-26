"use client";
// PriceScreen — Pre-swipe step 3 of 6.
//
// V2 changes:
//   - Count badges on each tier button during voting (no named attribution until reveal)
//   - Buttons stay visible in locked state after voting
//   - 1000ms delay before phase advances on the last vote
//   - Tiebreaker: lower-bound wins (cheapest tier chosen by anyone in the group)
//   - Reveal copy communicates the ceiling ("$$ and under") not just the floor

import { db } from "@/lib/firebase";
import { ref, set, get } from "firebase/database";
import { Session } from "@/lib/types";

const PRICE_TIERS = ["$", "$$", "$$$", "$$$$"] as const;
const PRICE_DESCRIPTORS: Record<string, string> = {
  "$":    "Casual",
  "$$":   "Mid-range",
  "$$$":  "Nice out",
  "$$$$": "Splurge",
};
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
  const totalParticipants = participants.length;
  const responses = session.responses?.price || {};
  const myResponse = responses[participantId] as PriceTier | undefined;
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  const totalResponded = Object.keys(responses).length;

  // Live counts per tier — drives the badge display
  function tierCount(tier: PriceTier): number {
    return Object.values(responses).filter((v) => v === tier).length;
  }

  async function handleVote(tier: PriceTier) {
    if (myResponse) return; // guard against double-tap

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
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await set(ref(db, `sessions/${sessionId}/phase`), "price-reveal");
    }
  }

  async function handleContinue() {
    await set(ref(db, `sessions/${sessionId}/phase`), "veto");
  }

  // V2 tiebreaker: lower-bound wins — cheapest tier anyone chose
  function getGroupTier(): PriceTier {
    const votes = Object.values(responses) as PriceTier[];
    if (votes.length === 0) return "$$";
    return PRICE_TIERS.find((tier) => votes.includes(tier)) ?? "$$";
  }

  // V2 reveal copy: communicates the ceiling ("$$ and under")
  function getSummary(): string {
    const floor = getGroupTier();
    const votes = Object.values(responses) as PriceTier[];
    const allSame = votes.every((v) => v === floor);
    const spread = votes.length > 0 &&
      PRICE_TIERS.indexOf(votes.reduce((a, b) =>
        PRICE_TIERS.indexOf(a) > PRICE_TIERS.indexOf(b) ? a : b
      )) - PRICE_TIERS.indexOf(floor) >= 2;

    const ceilingLabels: Record<PriceTier, string> = {
      "$":    "keeping it casual — $ and under in the mix.",
      "$$":   "a mid-range night — $$ and under in the mix.",
      "$$$":  "a nicer night — $$$ and under in the mix.",
      "$$$$": "anything goes — the full range is in play.",
    };

    if (allSame) {
      return `Everyone's aligned — ${ceilingLabels[floor]}`;
    }
    if (spread) {
      return `Big range tonight — going with ${floor} to keep it open for everyone.`;
    }
    return `Split decision — ${ceilingLabels[floor]}`;
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        <h2 className="text-2xl font-semibold text-center leading-snug">
          What kind of night is it?
        </h2>

        {/* ── VOTING STATE — tier buttons with live count badges ── */}
        {!isReveal && (
          <>
            <div className="grid grid-cols-4 gap-2">
              {PRICE_TIERS.map((tier) => {
                const isMyPick = myResponse === tier;
                const isOtherPick = myResponse && !isMyPick; // I voted but not this tier
                const count = tierCount(tier);
                const othersPickedThis = !myResponse && count > 0; // others picked, I haven't voted

                return (
                  <button
                    key={tier}
                    onClick={() => handleVote(tier)}
                    disabled={!!myResponse}
                    className={[
                      "py-5 rounded-2xl font-semibold text-lg touch-manipulation transition-colors flex flex-col items-center gap-1",
                      isMyPick
                        ? "bg-white text-gray-950 cursor-default"                           // my pick
                        : isOtherPick
                        ? "bg-gray-800 text-gray-600 cursor-default"                        // I voted elsewhere
                        : othersPickedThis
                        ? "bg-gray-700 text-gray-100 border border-white/20 cursor-pointer" // others picked it
                        : "bg-gray-800 text-white hover:bg-gray-700 cursor-pointer",        // nobody yet
                    ].join(" ")}
                  >
                    <span>{tier}</span>
                    <span className="text-xs font-normal opacity-60">{PRICE_DESCRIPTORS[tier]}</span>
                    <span className="text-xs font-normal opacity-50">
                      {count > 0 ? count : "·"}
                    </span>
                  </button>
                );
              })}
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
