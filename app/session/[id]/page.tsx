"use client";
// This is the main session page. Every participant — creator and joiner alike —
// ends up here after entering their name. The URL contains the session ID
// (e.g. /session/MATCH7F).
//
// This page does one job: listen to the session in Firebase and render the
// correct screen based on the `phase` field. When the phase changes in
// Firebase (because one participant's action triggered it), every device
// gets the update simultaneously and re-renders.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { ref, onValue } from "firebase/database";
import { Session } from "@/lib/types";
import LobbyScreen from "@/components/LobbyScreen";
import DineInScreen from "@/components/DineInScreen";
import DistanceScreen from "@/components/DistanceScreen";
import PriceScreen from "@/components/PriceScreen";
import VetoScreen from "@/components/VetoScreen";
import DietaryScreen from "@/components/DietaryScreen";
import PreferencesScreen from "@/components/PreferencesScreen";
import SwipeScreen from "@/components/SwipeScreen";
import WaitingScreen from "@/components/WaitingScreen";
import AnticipationScreen from "@/components/AnticipationScreen";
import SummaryScreen from "@/components/SummaryScreen";

export default function SessionPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [participantId, setParticipantId] = useState<string>("");
  const [notFound, setNotFound] = useState(false);

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

  // ── Loading states ──
  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-gray-950 text-white">
        <div className="text-center space-y-4">
          <p className="text-xl">Session not found.</p>
          <a href="/" className="text-gray-400 underline text-sm">← Go back home</a>
        </div>
      </main>
    );
  }

  if (!session || !participantId) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-gray-950 text-white">
        <p className="text-gray-400">Loading session...</p>
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

  if (session.phase === "preferences" || session.phase === "preferences-reveal") {
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
    <main className="min-h-screen flex items-center justify-center p-8 bg-gray-950 text-white">
      <p className="text-gray-400 font-mono">phase: {session.phase}</p>
    </main>
  );
}
