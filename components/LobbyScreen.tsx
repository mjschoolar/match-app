"use client";
// LobbyScreen — shown to all participants while waiting to begin.
//
// V3.2 changes:
//   - Participants can tap the pencil icon next to their own name to edit it in place.
//     The update writes to Firebase immediately and reflects on all devices.
//   - Creator sees a ✕ remove button next to each other participant. Removing a
//     participant deletes their entry from participants/ and cleans up any partial
//     response data. Only available in the lobby phase.

import { useState } from "react";
import { db } from "@/lib/firebase";
import { ref, set, remove } from "firebase/database";
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

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  function startEditing() {
    setEditValue(session.participants[participantId]?.name ?? "");
    setIsEditing(true);
  }

  async function commitEdit() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.participants[participantId]?.name) {
      await set(ref(db, `sessions/${sessionId}/participants/${participantId}/name`), trimmed);
    }
    setIsEditing(false);
  }

  async function handleRemove(pid: string) {
    const responseKeys = ["dineIn", "distance", "price", "veto", "vetoDone", "dietary", "dietaryDone", "preferences", "preferencesDone"];
    await remove(ref(db, `sessions/${sessionId}/participants/${pid}`));
    await Promise.all(
      responseKeys.map((key) => remove(ref(db, `sessions/${sessionId}/responses/${key}/${pid}`)))
    );
  }

  async function handleStart() {
    await set(ref(db, `sessions/${sessionId}/phase`), "dine-in");
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
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
          {participants.map(([id, participant]) => {
            const isMe = id === participantId;
            const isCreatorRow = id === session.creatorId;

            return (
              <div
                key={id}
                onClick={() => { if (isMe && !isEditing) startEditing(); }}
                className={[
                  "flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3",
                  isMe && !isEditing ? "cursor-pointer" : "",
                ].join(" ")}
              >
                <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />

                {/* Name — editable for own row only */}
                {isMe && isEditing ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 bg-transparent border-b border-white/40 text-white font-medium outline-none"
                  />
                ) : (
                  <span className="flex-1 font-medium">
                    {participant.name}
                    {isMe && <span className="text-gray-500 font-normal"> (you)</span>}
                  </span>
                )}

                {/* Pencil icon — visual affordance for own row, click handled by container */}
                {isMe && !isEditing && (
                  <span className="text-gray-500 text-sm px-1">✏</span>
                )}

                {/* Remove button — creator only, not for themselves or while editing their own name */}
                {isCreator && !isMe && !isCreatorRow && (
                  <button
                    onClick={() => handleRemove(id)}
                    className="text-gray-600 hover:text-red-400 touch-manipulation text-sm px-1 ml-auto"
                    aria-label="Remove participant"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}

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
