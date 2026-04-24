"use client";
// The "use client" directive tells Next.js this page runs in the browser.
// We need this because we use localStorage (browser-only) and Firebase.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { ref, set, get } from "firebase/database";
import { generateSessionId, generateParticipantId } from "@/lib/session";

// The home screen has three states: the initial choice, start mode, and join mode.
type Mode = "home" | "start" | "join";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("home");
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Creator flow: generate a session ID, write the session to Firebase,
  // add ourselves as the first participant, then navigate to the session page.
  async function handleStartSession() {
    if (!name.trim()) return;
    setLoading(true);
    setError("");

    // Always generate a fresh participant ID for each new session.
    // We store it keyed to the session ID so that:
    //   (a) a page refresh on this device recovers the same ID
    //   (b) two tabs in the same browser each get their own ID (no collision)
    const sessionId = generateSessionId();
    const participantId = generateParticipantId();
    localStorage.setItem(`participantId_${sessionId}`, participantId);
    const now = Date.now();

    try {
      await set(ref(db, `sessions/${sessionId}`), {
        phase: "lobby",
        creatorId: participantId,
        createdAt: now,
        participants: {
          [participantId]: {
            name: name.trim(),
            joinedAt: now,
          },
        },
      });

      router.push(`/session/${sessionId}`);
    } catch (err: unknown) {
      setError("Failed to create session. Please try again.");
      setLoading(false);
    }
  }

  // Joiner flow: check the code is valid, add ourselves as a participant,
  // then navigate to the same session page.
  async function handleJoinSession() {
    if (!name.trim() || !joinCode.trim()) return;
    setLoading(true);
    setError("");

    const code = joinCode.trim().toUpperCase();
    // Same logic as the creator: fresh ID per session, stored so refresh recovers it.
    const participantId = generateParticipantId();
    localStorage.setItem(`participantId_${code}`, participantId);
    const now = Date.now();

    try {
      // First check the session exists
      const sessionSnap = await get(ref(db, `sessions/${code}`));
      if (!sessionSnap.exists()) {
        setError("Session not found. Double-check the code and try again.");
        setLoading(false);
        return;
      }

      // Add ourselves to the participants list
      await set(ref(db, `sessions/${code}/participants/${participantId}`), {
        name: name.trim(),
        joinedAt: now,
      });

      router.push(`/session/${code}`);
    } catch (err: unknown) {
      setError("Failed to join session. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-8">

        <h1 className="text-4xl font-bold text-center tracking-tight">Match</h1>

        {/* ── Home: two entry points ── */}
        {mode === "home" && (
          <div className="space-y-4">
            <button
              onClick={() => setMode("start")}
              className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
            >
              Start a session
            </button>
            <button
              onClick={() => setMode("join")}
              className="w-full py-4 border border-gray-700 text-white rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation"
            >
              Join with a code
            </button>
          </div>
        )}

        {/* ── Start: name entry → create session ── */}
        {mode === "start" && (
          <div className="space-y-4">
            <button
              onClick={() => { setMode("home"); setError(""); }}
              className="text-gray-400 text-sm"
            >
              ← Back
            </button>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Your name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartSession()}
                placeholder="Enter your name"
                className="w-full px-4 py-3 bg-gray-800 rounded-xl text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-white/20 text-lg"
                autoFocus
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleStartSession}
              disabled={!name.trim() || loading}
              className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg disabled:opacity-40 cursor-pointer touch-manipulation"
            >
              {loading ? "Creating..." : "Create session"}
            </button>
          </div>
        )}

        {/* ── Join: code + name entry → join session ── */}
        {mode === "join" && (
          <div className="space-y-4">
            <button
              onClick={() => { setMode("home"); setError(""); }}
              className="text-gray-400 text-sm"
            >
              ← Back
            </button>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Session code</label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. MATCH7"
                maxLength={6}
                className="w-full px-4 py-3 bg-gray-800 rounded-xl text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-white/20 font-mono text-2xl tracking-widest text-center uppercase"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Your name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoinSession()}
                placeholder="Enter your name"
                className="w-full px-4 py-3 bg-gray-800 rounded-xl text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-white/20 text-lg"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleJoinSession}
              disabled={!name.trim() || !joinCode.trim() || loading}
              className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg disabled:opacity-40 cursor-pointer touch-manipulation"
            >
              {loading ? "Joining..." : "Join session"}
            </button>
          </div>
        )}

      </div>
    </main>
  );
}
