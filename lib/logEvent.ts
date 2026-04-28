// lib/logEvent.ts
// Shared fire-and-forget event logging utility for session instrumentation.
//
// Writes a single timestamped entry to sessions/{sessionId}/log/ using Firebase
// push(), which generates a key that encodes insertion time — entries read back
// in key order are already in chronological order.
//
// IMPORTANT: Every call in an API route must be fire-and-forget — never await
// this in a critical path. A failed log write must never affect the session.

import { ref, push, set } from "firebase/database";
import type { Database } from "firebase/database";

export function logEvent(
  db: Database,
  sessionId: string,
  event: string,
  data?: Record<string, unknown>
): void {
  const logRef = push(ref(db, `sessions/${sessionId}/log`));
  set(logRef, {
    event,
    timestamp: Date.now(),
    ...(data ?? {}),
  }).catch((err) => {
    console.error(`[logEvent] Failed to write "${event}" for ${sessionId}:`, err);
  });
}
