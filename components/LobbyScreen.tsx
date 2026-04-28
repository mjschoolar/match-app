"use client";
// LobbyScreen — waiting room for all participants.
//
// V2.0 changes:
//   - Location label ("Near Uptown Dallas") shown to everyone.
//   - Creator sees a "Change" affordance next to the label.
//     Tapping opens an inline address field; submitting geocodes the address
//     and overwrites location in Firebase (updates on all devices).
//   - Location is required — if somehow absent, "Location not set" placeholder shown.

import { useState, useEffect, useRef } from "react";
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

  // Change 7: fire check-coverage once when the creator enters the lobby and location is set.
  // Runs in the background — no UI indication needed. Writes categoryCoverage to Firebase.
  const coverageCalledRef = useRef(false);
  useEffect(() => {
    if (!isCreator || coverageCalledRef.current) return;
    const lat = session.location?.lat;
    const lng = session.location?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return;

    coverageCalledRef.current = true;
    fetch("/api/check-coverage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, lat, lng }),
    }).catch((err) => {
      console.error("[LobbyScreen] check-coverage failed:", err);
    });
  }, [isCreator, session.location, sessionId]);

  // Location change affordance
  const [isChangingLocation, setIsChangingLocation] = useState(false);
  const [newAddress, setNewAddress] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");

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
    const responseKeys = [
      "dineIn", "distance", "price", "veto", "vetoDone",
      "dietary", "dietaryDone", "preferences", "preferencesDone",
      "preferencesPositive", "preferencesPositiveDone",
      "preferencesNegative", "preferencesNegativeDone",
    ];
    await remove(ref(db, `sessions/${sessionId}/participants/${pid}`));
    await Promise.all(
      responseKeys.map((key) => remove(ref(db, `sessions/${sessionId}/responses/${key}/${pid}`)))
    );
  }

  async function handleStart() {
    await set(ref(db, `sessions/${sessionId}/phase`), "dine-in");
  }

  // Creator: geocode the new address and overwrite location in Firebase
  async function handleLocationChange() {
    if (!newAddress.trim()) return;
    setLocationLoading(true);
    setLocationError("");

    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: newAddress.trim() }),
      });

      if (!res.ok) {
        throw new Error("Location not found");
      }

      const data = await res.json();
      await set(ref(db, `sessions/${sessionId}/location`), {
        lat: data.lat,
        lng: data.lng,
        source: "manual",
        label: data.label || newAddress.trim(),
      });

      setIsChangingLocation(false);
      setNewAddress("");
    } catch {
      setLocationError("We couldn't find that location — try a more specific address.");
    } finally {
      setLocationLoading(false);
    }
  }

  const locationLabel = session.location?.label || null;

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

        {/* Location indicator — visible to everyone */}
        <div className="bg-gray-800 rounded-xl px-4 py-3">
          {isChangingLocation ? (
            /* ── Creator's location change form ── */
            <div className="space-y-3">
              <label className="block text-xs text-gray-400 uppercase tracking-wider">
                Enter a new location
              </label>
              <input
                type="text"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLocationChange()}
                placeholder="e.g. Deep Ellum, Dallas TX"
                className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-white/20 text-sm"
                autoFocus
              />
              {locationError && (
                <p className="text-red-400 text-xs">{locationError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleLocationChange}
                  disabled={!newAddress.trim() || locationLoading}
                  className="flex-1 py-2 bg-white text-gray-950 rounded-lg text-sm font-semibold disabled:opacity-40 cursor-pointer touch-manipulation"
                >
                  {locationLoading ? "Finding…" : "Update location"}
                </button>
                <button
                  onClick={() => { setIsChangingLocation(false); setLocationError(""); setNewAddress(""); }}
                  className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm cursor-pointer touch-manipulation"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* ── Normal location display ── */
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-sm">📍</span>
                <span className="text-sm text-gray-300">
                  {locationLabel ? `Near ${locationLabel}` : "Location not set"}
                </span>
              </div>
              {isCreator && (
                <button
                  onClick={() => setIsChangingLocation(true)}
                  className="text-xs text-gray-500 hover:text-gray-300 underline touch-manipulation"
                >
                  Change
                </button>
              )}
            </div>
          )}
        </div>

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

                {isMe && !isEditing && (
                  <span className="text-gray-500 text-sm px-1">✏</span>
                )}

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

          <div className="flex items-center gap-3 px-4 py-3 opacity-30">
            <span className="w-2 h-2 rounded-full border border-gray-500 flex-shrink-0" />
            <span className="text-gray-500 text-sm">Waiting for others…</span>
          </div>
        </div>

        {/* Action area */}
        {isCreator ? (
          <button
            onClick={handleStart}
            className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
          >
            Let&apos;s start
          </button>
        ) : (
          <p className="text-center text-gray-400 text-sm pt-2">
            Waiting for {creatorName} to start…
          </p>
        )}

      </div>
    </main>
  );
}
