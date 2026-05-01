"use client";
// This is the main session page. Every participant — creator and joiner alike —
// ends up here after entering their name. The URL contains the session ID
// (e.g. /session/MATCH7F).
//
// This page does one job: listen to the session in Firebase and render the
// correct screen based on the `phase` field. When the phase changes in
// Firebase (because one participant's action triggered it), every device
// gets the update simultaneously and re-renders.
//
// V2.2.1: Added session lifecycle logging. Phase transitions, preference/veto
// captures, setup parameters, and swipe distribution are all written to
// sessions/{sessionId}/log/ as fire-and-forget events.

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { ref, onValue, set } from "firebase/database";
import { logEvent } from "@/lib/logEvent";
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

  // Phase transition tracking — used for phase.advanced timing events
  const prevPhaseRef = useRef<string | null>(null);
  const phaseStartTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const pid = localStorage.getItem(`participantId_${sessionId}`) || "";
    setParticipantId(pid);

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

  // ── Phase transition logging ──────────────────────────────────────────────
  // Fires once per phase change, from the creator's device only to avoid
  // duplicate log entries in multi-participant sessions.
  useEffect(() => {
    if (!session || !participantId) return;

    const currentPhase = session.phase;
    if (!currentPhase) return;

    const isCreator = session.creatorId === participantId;
    const prev = prevPhaseRef.current;

    // First render — initialise tracker, don't log yet
    if (prev === null) {
      prevPhaseRef.current = currentPhase;
      phaseStartTimeRef.current = Date.now();
      return;
    }

    // Phase changed
    if (prev !== currentPhase) {
      const durationMs = Date.now() - phaseStartTimeRef.current;

      if (isCreator) {
        // Core phase timing
        logEvent(db, sessionId, "phase.advanced", {
          from: prev,
          to: currentPhase,
          durationMs,
        });

        // Phase-specific data captures

        if (currentPhase === "preferences-reveal") {
          // Capture what everyone selected in both preference passes
          logEvent(db, sessionId, "session.preferences.captured", {
            positive: session.responses?.preferencesPositive ?? {},
            negative: session.responses?.preferencesNegative ?? {},
            participantCount: Object.keys(session.participants ?? {}).length,
          });
        }

        if (currentPhase === "veto-reveal") {
          // Capture veto selections (null = passed)
          logEvent(db, sessionId, "session.veto.captured", {
            vetos: session.responses?.veto ?? {},
            participantCount: Object.keys(session.participants ?? {}).length,
          });
        }

        if (currentPhase === "generating-stack") {
          // Capture the final session setup parameters at the point generation fires
          logEvent(db, sessionId, "session.setup.complete", {
            dineIn: session.responses?.dineIn ?? {},
            distance: session.responses?.distance ?? {},
            price: session.responses?.price ?? {},
            participantCount: Object.keys(session.participants ?? {}).length,
          });
        }

        if (currentPhase === "swipe") {
          logEvent(db, sessionId, "session.swiping.started", {
            participantCount: Object.keys(session.participants ?? {}).length,
          });
        }
      }

      // Update refs for the next transition (all participants, not just creator)
      prevPhaseRef.current = currentPhase;
      phaseStartTimeRef.current = Date.now();
    }
  }, [session, participantId, sessionId]);

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

      // Track swipe distribution per restaurant alongside existing match calc
      const swipeDistribution: Record<string, { name: string; right: number; left: number }> = {};

      for (const r of restaurants) {
        if (!r || !r.id) continue;

        const matchedIds = allIds.filter((pid) => swipeDecisions[pid]?.[r.id] === "right");
        const leftIds    = allIds.filter((pid) => swipeDecisions[pid]?.[r.id] === "left");
        const matchedBy  = matchedIds.map((pid) => participants[pid]?.name ?? pid);

        // Swipe distribution
        swipeDistribution[r.id] = {
          name:  r.name ?? "",
          right: matchedIds.length,
          left:  leftIds.length,
        };

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

      // Log swipe distribution — creator only, consistent with other session-level
      // events. The swipeAdvancedRef guard is per-device so can't prevent two
      // participants from both detecting all-done in the same Firebase update cycle.
      if (session.creatorId === participantId) {
        logEvent(db, sessionId, "session.swipe.distribution", {
          distribution: swipeDistribution,
          participantCount: total,
          stackSize: restaurants.length,
        });
      }

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
      logEvent(db, sessionId, "error", {
        route: "swipe-watcher",
        message: err instanceof Error ? err.message : "Unknown error",
      });
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
    return (
      <SummaryScreen
        session={session}
        sessionId={sessionId}
        participantId={participantId}
      />
    );
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-8 bg-gray-950 text-white">
      <p className="text-gray-400 font-mono">phase: {session.phase}</p>
    </main>
  );
}
