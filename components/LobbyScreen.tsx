"use client";
// LobbyScreen — shown to all participants while waiting to begin.
//
// Creator sees: the session code (to share with others), the live participant
// list, and a "Let's start" button.
//
// Joiners see: the live participant list and a message that the creator
// controls when things start.
//
// The participant list updates in real time — no refresh needed. When
// someone new joins, their name appears on every device immediately.

import { db } from "@/lib/firebase";
import { ref, set } from "firebase/database";
import { Session } from "@/lib/types";

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

export default function LobbyScreen({ sessionId, session, participantId }: Props) {
  const isCreator = session.creatorId === participantId;
  const participants = Object.entries(session.participants || {});
  const creatorName = session.participants[session.creatorId]?.name ?? "the host";

  // The creator taps this to advance everyone to the first voting step.
  // Writing a new phase to Firebase triggers re-renders on all devices.
  async function handleStart() {
    await set(ref(db, `sessions/${sessionId}/phase`), "dine-in");
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-6">

        {/* Session code — creator only */}
        {isCreator && (
          <div className="bg-gray-800 rounded-2xl p-6 text-center space-y-2">
            <p className="text-sm text-gray-400">Share this code</p>
            <p className="text-5xl font-mono font-bold tracking-widest">{sessionId}</p>
            <p className="text-sm text-gray-500">Others enter this at match.app</p>
          </div>
        )}

        {/* Live participant list */}
        <div className="space-y-2">
          <p className="text-sm text-gray-400 text-center mb-3">In the room</p>
          {participants.map(([id, participant]) => (
            <div
              key={id}
              className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3"
            >
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
              <span className="font-medium">
                {participant.name}
                {id === participantId && (
                  <span className="text-gray-500 font-normal"> (you)</span>
                )}
              </span>
            </div>
          ))}

          {/* Placeholder dots to suggest more people can join */}
          <div className="flex items-center gap-3 px-4 py-3 opacity-30">
            <span className="w-2 h-2 rounded-full border border-gray-500 flex-shrink-0" />
            <span className="text-gray-500 text-sm">Waiting for others...</span>
          </div>
        </div>

        {/* Action area — different for creator vs joiner */}
        {isCreator ? (
          <button
            onClick={handleStart}
            className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
          >
            Let&apos;s start
          </button>
        ) : (
          <p className="text-center text-gray-400 text-sm pt-2">
            Waiting for {creatorName} to start...
          </p>
        )}

      </div>
    </main>
  );
}
