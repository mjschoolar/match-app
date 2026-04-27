"use client";
// AnticipationScreen — fires simultaneously on all devices the moment
// the last participant finishes the swipe stack.
//
// This screen bridges the gap between "everyone is done swiping" and
// the results appearing. It gives the reveal weight — a brief shared
// beat before the summary. The exact form is intentionally minimal
// for this prototype.
//
// Auto-advances to "summary" after 2.5 seconds. All devices run this
// timer independently, but they all start at the same moment (when
// Firebase wrote "anticipation"), so they all arrive at "summary"
// within milliseconds of each other.
//
// Only the creator actually writes the phase change to avoid redundant
// writes — but even if multiple devices wrote it, it would be the same
// value and Firebase handles that gracefully.

import { useEffect } from "react";
import { db } from "@/lib/firebase";
import { ref, set } from "firebase/database";

interface Props {
  sessionId: string;
  isCreator: boolean;
}

export default function AnticipationScreen({ sessionId, isCreator }: Props) {
  useEffect(() => {
    if (!isCreator) return;

    // Creator auto-advances everyone to summary after 2.5 seconds
    const timer = setTimeout(async () => {
      await set(ref(db, `sessions/${sessionId}/phase`), "summary");
    }, 2500);

    return () => clearTimeout(timer);
  }, [sessionId, isCreator]);

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full text-center space-y-3">
        <p className="text-4xl">🍽️</p>
        <h2 className="text-2xl font-semibold">Everyone&apos;s in.</h2>
        <p className="text-gray-400">Let&apos;s see where you landed...</p>
      </div>
    </main>
  );
}
