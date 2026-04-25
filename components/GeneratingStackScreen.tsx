"use client";
// GeneratingStackScreen — brief beat between dietary and swipe.
//
// Fires on all devices simultaneously after the last participant
// completes the dietary step. The creator auto-advances to "swipe"
// after 2500ms. Everyone sees the same screen at the same moment.
//
// Same pattern as AnticipationScreen: only the creator writes the
// phase change to avoid duplicate writes.

import { useEffect } from "react";
import { db } from "@/lib/firebase";
import { ref, set } from "firebase/database";

interface Props {
  sessionId: string;
  isCreator: boolean;
}

export default function GeneratingStackScreen({ sessionId, isCreator }: Props) {
  useEffect(() => {
    if (!isCreator) return;

    const timer = setTimeout(async () => {
      await set(ref(db, `sessions/${sessionId}/phase`), "swipe");
    }, 2500);

    return () => clearTimeout(timer);
  }, [isCreator, sessionId]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full text-center space-y-3">
        <p className="text-2xl font-semibold">Generating your stack</p>
        <p className="text-gray-500 text-sm">Pulling together everything you told us</p>
      </div>
    </main>
  );
}
