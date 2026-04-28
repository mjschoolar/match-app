"use client";
// app/page.tsx — session creation and join.
//
// V2.0 changes:
//   - Location capture added to the creator flow.
//   - After tapping "Create session," GPS is requested. If granted, the
//     coordinates are reverse-geocoded to a neighborhood label and the session
//     is created with that location written to Firebase.
//   - If GPS is denied or unavailable, a manual address entry field appears.
//     The session is not created until a valid location is confirmed.
//   - Joiner flow is unchanged.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { ref, set, get } from "firebase/database";
import { generateSessionId, generateParticipantId } from "@/lib/session";
import { logEvent } from "@/lib/logEvent";

type Mode = "home" | "start" | "location-manual" | "join";

interface LocationData {
  lat: number;
  lng: number;
  label: string;
  source: "gps" | "manual";
}

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("home");
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState(""); // "Getting your location..." etc.

  // ── Creator flow ────────────────────────────────────────────────────────────

  // Called when the creator taps "Create session."
  // Attempts GPS first; falls back to manual entry on denial.
  async function handleStartSession() {
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    setLocationStatus("Getting your location…");

    try {
      const coords = await new Promise<GeolocationCoordinates>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation not supported"));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
          { timeout: 10000, maximumAge: 30000 }
        );
      });

      setLocationStatus("Pinning your location…");

      // Reverse geocode to get a neighborhood label
      const geoRes = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: coords.latitude, lng: coords.longitude }),
      });

      const geoData = await geoRes.json();

      await createSession({
        lat: coords.latitude,
        lng: coords.longitude,
        label: geoData.label || "Your location",
        source: "gps",
      });
    } catch {
      // GPS denied or failed — show manual address entry
      setLoading(false);
      setLocationStatus("");
      setMode("location-manual");
    }
  }

  // Called when the creator submits a manual address.
  async function handleManualLocation() {
    if (!manualAddress.trim()) return;
    setLoading(true);
    setError("");
    setLocationStatus("Finding that location…");

    try {
      const geoRes = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: manualAddress.trim() }),
      });

      if (!geoRes.ok) {
        const err = await geoRes.json();
        throw new Error(err.error || "Location not found");
      }

      const geoData = await geoRes.json();

      await createSession({
        lat: geoData.lat,
        lng: geoData.lng,
        label: geoData.label || manualAddress.trim(),
        source: "manual",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(
        msg.includes("not found") || msg.includes("Location")
          ? "We couldn't find that location — try a more specific address."
          : "Failed to set location. Please try again."
      );
      setLoading(false);
      setLocationStatus("");
    }
  }

  // Creates the session in Firebase and navigates to the lobby.
  async function createSession(location: LocationData) {
    const sessionId = generateSessionId();
    const participantId = generateParticipantId();
    localStorage.setItem(`participantId_${sessionId}`, participantId);
    const now = Date.now();

    try {
      await set(ref(db, `sessions/${sessionId}`), {
        phase: "lobby",
        creatorId: participantId,
        createdAt: now,
        location: {
          lat: location.lat,
          lng: location.lng,
          source: location.source,
          label: location.label,
        },
        participants: {
          [participantId]: {
            name: name.trim(),
            joinedAt: now,
          },
        },
      });

      // Log session creation — fire and forget.
      logEvent(db, sessionId, "session.created", {
        locationLabel: location.label,
        lat: location.lat,
        lng: location.lng,
        locationSource: location.source,
      });

      // Fire pool build immediately after session creation — fire and forget.
      // p1 fetches all 22 categories and writes categoryCoverage, then chains to p2 and p3.
      // The full chain runs in the background while participants join the lobby.
      // By the time the group reaches the preference grid, categoryCoverage is ready.
      // By the time they reach generating-stack, the full pool is ready.
      fetch("/api/build-pool-p1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, lat: location.lat, lng: location.lng }),
      }).catch((err) => {
        console.error("[createSession] build-pool-p1 failed:", err);
      });

      router.push(`/session/${sessionId}`);
    } catch {
      setError("Failed to create session. Please try again.");
      setLoading(false);
      setLocationStatus("");
    }
  }

  // ── Joiner flow (unchanged) ──────────────────────────────────────────────

  async function handleJoinSession() {
    if (!name.trim() || !joinCode.trim()) return;
    setLoading(true);
    setError("");

    const code = joinCode.trim().toUpperCase();
    const participantId = generateParticipantId();
    localStorage.setItem(`participantId_${code}`, participantId);
    const now = Date.now();

    try {
      const sessionSnap = await get(ref(db, `sessions/${code}`));
      if (!sessionSnap.exists()) {
        setError("Session not found. Double-check the code and try again.");
        setLoading(false);
        return;
      }

      await set(ref(db, `sessions/${code}/participants/${participantId}`), {
        name: name.trim(),
        joinedAt: now,
      });

      router.push(`/session/${code}`);
    } catch {
      setError("Failed to join session. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full space-y-8">

        <h1 className="text-4xl font-bold text-center tracking-tight">Match</h1>

        {/* ── Home ── */}
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

        {/* ── Start: name entry ── */}
        {mode === "start" && (
          <div className="space-y-4">
            <button
              onClick={() => { setMode("home"); setError(""); setLocationStatus(""); }}
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
            {locationStatus && (
              <p className="text-gray-400 text-sm text-center">{locationStatus}</p>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleStartSession}
              disabled={!name.trim() || loading}
              className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg disabled:opacity-40 cursor-pointer touch-manipulation"
            >
              {loading ? "Getting location…" : "Create session"}
            </button>
          </div>
        )}

        {/* ── Location manual entry (GPS denied) ── */}
        {mode === "location-manual" && (
          <div className="space-y-4">
            <button
              onClick={() => { setMode("start"); setError(""); setLocationStatus(""); }}
              className="text-gray-400 text-sm"
            >
              ← Back
            </button>
            <div className="space-y-1">
              <p className="text-lg font-semibold">Where are you?</p>
              <p className="text-sm text-gray-400">
                We need your location to find restaurants nearby.
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Address or neighborhood</label>
              <input
                type="text"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleManualLocation()}
                placeholder="e.g. Uptown Dallas, TX"
                className="w-full px-4 py-3 bg-gray-800 rounded-xl text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-white/20 text-lg"
                autoFocus
              />
            </div>
            {locationStatus && (
              <p className="text-gray-400 text-sm text-center">{locationStatus}</p>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={handleManualLocation}
              disabled={!manualAddress.trim() || loading}
              className="w-full py-4 bg-white text-gray-950 rounded-2xl font-semibold text-lg disabled:opacity-40 cursor-pointer touch-manipulation"
            >
              {loading ? "Finding location…" : "Use this location"}
            </button>
          </div>
        )}

        {/* ── Join ── */}
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
              {loading ? "Joining…" : "Join session"}
            </button>
          </div>
        )}

      </div>
    </main>
  );
}
