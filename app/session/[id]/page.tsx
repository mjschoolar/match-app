"use client";
// This is the main session page. Every participant — creator and joiner alike —
// ends up here after entering their name. The URL contains the session ID
// (e.g. /session/MATCH7F).
//
// This page does one job: listen to the session in Firebase and render the
// correct screen based on the `phase` field. When the phase changes in
// Firebase (because one participant's action triggered it), every device
// gets the update simultaneously and re-renders.

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { ref, onValue, set } from "firebase/database";
import { Session, StackRestaurant, RestaurantResult } from "@/lib/types";
import LobbyScreen from "@/components/LobbyScreen";
import DineInScreen from "@/components/DineInScreen";
import DistanceScreen from "@/components/DistanceScreen";
import PriceScreen from "@/components/PriceScreen";
import VetoScreen from "@/components/VetoScreen";
import DietaryScreen from "@/components/DietaryScreen";
import PreferencesPositiveScreen from "@/components/PreferencesPositiveScreen";
import PreferencesNegativeScreen from "@/components/PreferencesNegativeScreen";
import PreferencesScreen from "@/components/PreferencesScreen";
import SwipeScreen from "@/components/SwipeScreen";
import WaitingScreen from "@/components/WaitingScreen";
import AnticipationScreen from "@/components/AnticipationScreen";
import GeneratingStackScreen from "@/components/GeneratingStackScreen";
import SummaryScreen from "@/components/SummaryScreen";

export default function SessionPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [participantId, setParticipantId] = useState<string>("");
  const [notFound, setNotFound] = useState(false);
  // Guard so the swipe-completion watcher only fires once per session
  const swipeAdvancedRef = useRef(false);

  useEffect(() => {
    // Read the participant's own ID from localStorage.
    // It's stored under a session-specific key so two tabs in the same browser
    // each maintain their own identity without colliding.
    const pid = localStorage.getItem(`participantId_${sessionId}`) || "";
    setParticipantId(pid);

    // Subscribe to the whole session object in Firebase.
    // onValue fires immediately with the current data, then fires again
    // every time anything in the session changes.
    const sessionRef = ref(db, `sessions/${sessionId}`);
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      if (!snapshot.exists()) {
        setNotFound(true);
        return;
      }
      setSession(snapshot.val() as Session);
    });

    return () => unsubscribe();
  }, [sessionId]);

  // ── Swipe completion watcher ──────────────────────────────────────────────
  // This runs on every Firebase update and advances the phase the moment all
  // participants finish swiping. Intentionally lives here in page.tsx rather
  // than inside SwipeScreen — page.tsx stays mounted through WaitingScreen, so
  // this fires reliably even if SwipeScreen is unmounted when the last device
  // finishes. Any device can trigger it; the write is idempotent.
  useEffect(() => {
    if (!session || !participantId) return;
    if (session.phase !== "swipe") return;
    if (swipeAdvancedRef.current) return;

    const allIds = Object.keys(session.participants || {});
    if (allIds.length === 0) return;

    const allDone = allIds.every((id) => session.swipeComplete?.[id] === true);
    if (!allDone) return;

    swipeAdvancedRef.current = true;

    try {
      // Normalise Firebase arrays-stored-as-objects → real arrays, drop any
      // null/undefined elements that could appear if Firebase compressed the data.
      function toArr<T>(val: unknown): T[] {
        if (!val) return [];
        if (Array.isArray(val)) return (val as T[]).filter((v) => v != null);
        return (Object.values(val as Record<string, T>)).filter((v) => v != null);
      }

      const restaurants = toArr<StackRestaurant>(session.stack?.restaurants);
      const participants = session.participants || {};
      const swipeDecisions = (session.swipeDecisions || {}) as Record<string, Record<string, string>>;
      const total = allIds.length;

      const complete: RestaurantResult[] = [];
      const majority: RestaurantResult[] = [];
      const partial: RestaurantResult[] = [];

      for (const r of restaurants) {
        // Skip any malformed restaurant entries
        if (!r || !r.id) continue;

        const matchedIds = allIds.filter((pid) => swipeDecisions[pid]?.[r.id] === "right");
        const matchedBy = matchedIds.map((pid) => participants[pid]?.name ?? pid);

        // Use ?? null for every nullable field — Firebase throws if it receives
        // undefined (null fields written to Firebase are dropped on write and
        // come back as undefined on read, so we must re-null them before re-writing).
        const entry: RestaurantResult = {
          id: r.id,
          name: r.name ?? "",
          cuisine: r.matchCategory ?? "",
          rating: r.rating ?? 0,
          reviewCount: r.reviewCount ?? 0,
          priceLevel: r.priceLevel ?? null,
          distance: `${r.distanceMiles ?? 0} mi`,
          photoUrl: r.photoUrl ?? null,
          address: r.address ?? "",
          phone: r.phone ?? null,
          websiteUrl: r.websiteUrl ?? null,
          location: r.location ?? null,
          matchedBy: matchedBy.length > 0 ? matchedBy : [],
        };

        if (matchedIds.length === total)        complete.push(entry);
        else if (matchedIds.length > total / 2) majority.push(entry);
        else if (matchedIds.length > 0)         partial.push(entry);
      }

      // Firebase cannot store empty arrays — replace with a placeholder so the
      // SummaryScreen's toArray() can handle it gracefully.
      const result = {
        complete: complete.length > 0 ? complete : null,
        majority: majority.length > 0 ? majority : null,
        partial:  partial.length  > 0 ? partial  : null,
      };

      set(ref(db, `sessions/${sessionId}/result`), result)
        .then(() => set(ref(db, `sessions/${sessionId}/phase`), "anticipation"))
        .catch(console.error);
    } catch (err) {
      console.error("[swipe watcher] Failed to calculate or write results:", err);
      // Reset the guard so it can retry on the next Firebase update
      swipeAdvancedRef.current = false;
    }
  }, [session, participantId, sessionId]);

  // ── Loading states ──
  if (notFound) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-8 bg-gray-950 text-white">
        <div className="text-center space-y-4">
          <p className="text-xl">Session not found.</p>
          <a href="/" className="text-gray-400 underline text-sm">← Go back home</a>
        </div>
      </main>
    );
  }

  if (!session || !participantId) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-8 bg-gray-950 text-white">
        <p className="text-gray-400">Loading session...</p>
      </main>
    );
  }

  // If this participant's ID no longer exists in the session, they were removed by the creator.
  if (!session.participants?.[participantId]) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
        <div className="text-center space-y-4">
          <p className="text-xl font-semibold">You&apos;ve been removed from this session.</p>
          <a href="/" className="text-gray-400 underline text-sm">← Go back home</a>
        </div>
      </main>
    );
  }

  // ── Phase router ──
  // Each phase maps to a screen component. As we build more phases,
  // we add them here. The phase field in Firebase is the single source
  // of truth — changing it in the database changes every device at once.

  if (session.phase === "lobby") {
    return (
      <LobbyScreen
        sessionId={sessionId}
        session={session}
        participantId={participantId}
      />
    );
  }

  if (session.phase === "dine-in" || session.phase === "dine-in-reveal") {
    return (
      <DineInScreen
        sessionId={sessionId}
        session={session}
        participantId={participantId}
      />
    );
  }

  if (session.phase === "distance" || session.phase === "distance-reveal") {
    return (
      <DistanceScreen
        sessionId={sessionId}
        session={session}
        participantId={participantId}
      />
    );
  }

  if (session.phase === "price" || session.phase === "price-reveal") {
    return (
      <PriceScreen
        sessionId={sessionId}
        session={session}
        participantId={participantId}
      />
    );
  }

  if (session.phase === "veto" || session.phase === "veto-reveal") {
    return (
      <VetoScreen
        sessionId={sessionId}
        session={session}
        participantId={participantId}
      />
    );
  }

  if (session.phase === "dietary") {
    return (
      <DietaryScreen
        sessionId={sessionId}
        session={session}
        participantId={participantId}
      />
    );
  }

  if (session.phase === "preferences-positive") {
    return (
      <PreferencesPositiveScreen
        sessionId={sessionId}
        session={session}
        participantId={participantId}
      />
    );
  }

  if (session.phase === "preferences-negative") {
    return (
      <PreferencesNegativeScreen
        sessionId={sessionId}
        session={session}
        participantId={participantId}
      />
    );
  }

  if (session.phase === "preferences-reveal") {
    return (
      <PreferencesScreen
        sessionId={sessionId}
        session={session}
        participantId={participantId}
      />
    );
  }

  if (session.phase === "swipe") {
    // Participants who have finished see the waiting screen;
    // everyone else sees their own swipe stack.
    if (session.swipeComplete?.[participantId]) {
      return <WaitingScreen />;
    }
    return (
      <SwipeScreen
        sessionId={sessionId}
        session={session}
        participantId={participantId}
      />
    );
  }

  if (session.phase === "generating-stack") {
    return (
      <GeneratingStackScreen
        sessionId={sessionId}
        session={session}
        isCreator={session.creatorId === participantId}
      />
    );
  }

  if (session.phase === "anticipation") {
    return (
      <AnticipationScreen
        sessionId={sessionId}
        isCreator={session.creatorId === participantId}
      />
    );
  }

  if (session.phase === "summary") {
    return <SummaryScreen session={session} />;
  }

  // Catch-all for any unexpected phase value
  return (
    <main className="min-h-dvh flex items-center justify-center p-8 bg-gray-950 text-white">
      <p className="text-gray-400 font-mono">phase: {session.phase}</p>
    </main>
  );
}
