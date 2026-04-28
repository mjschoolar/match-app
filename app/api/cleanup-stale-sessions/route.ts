// app/api/cleanup-stale-sessions/route.ts
// V2.2 — Stale session cron job.
//
// Runs daily at 4:00 AM UTC via Vercel Cron (configured in vercel.json).
// Deletes sessions older than CLEANUP_TTL_HOURS (default 168h = 7 days).
//
// Why 7 days for now: generous TTL while the app is in active testing.
// Once the prototype ships, lower to 24h or 48h.
//
// Requires:
//   CLEANUP_SECRET — a shared secret that must match the `Authorization: Bearer`
//   header to prevent unauthenticated external calls.
//   CLEANUP_TTL_HOURS — optional override (defaults to 168).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { ref, get, remove } from "firebase/database";

export async function GET(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────────────────────
  // Vercel Cron passes Authorization: Bearer {CRON_SECRET} automatically.
  // We verify it matches CLEANUP_SECRET so random callers can't trigger mass deletion.
  const secret = process.env.CLEANUP_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── TTL config ───────────────────────────────────────────────────────────────
  const ttlHours = parseInt(process.env.CLEANUP_TTL_HOURS ?? "168", 10);
  const ttlMs = ttlHours * 60 * 60 * 1000;
  const cutoff = Date.now() - ttlMs;

  // ── Read all sessions ────────────────────────────────────────────────────────
  let sessionsSnap;
  try {
    sessionsSnap = await get(ref(db, "sessions"));
  } catch (err) {
    console.error("[cleanup-stale-sessions] Failed to read sessions:", err);
    return NextResponse.json({ error: "Database read failed" }, { status: 500 });
  }

  if (!sessionsSnap.exists()) {
    return NextResponse.json({ deleted: 0, message: "No sessions found" });
  }

  const sessions = sessionsSnap.val() as Record<string, { createdAt?: number }>;

  // ── Identify stale sessions ─────────────────────────────────────────────────
  const staleIds = Object.entries(sessions)
    .filter(([, session]) => {
      const createdAt = session?.createdAt;
      if (typeof createdAt !== "number") return true; // no timestamp — delete it
      return createdAt < cutoff;
    })
    .map(([id]) => id);

  if (staleIds.length === 0) {
    return NextResponse.json({ deleted: 0, message: "No stale sessions" });
  }

  // ── Delete stale sessions ───────────────────────────────────────────────────
  const deletions = await Promise.allSettled(
    staleIds.map((id) => remove(ref(db, `sessions/${id}`)))
  );

  const succeeded = deletions.filter((r) => r.status === "fulfilled").length;
  const failed    = deletions.filter((r) => r.status === "rejected").length;

  console.log(
    `[cleanup-stale-sessions] Deleted ${succeeded}/${staleIds.length} stale sessions` +
    (failed > 0 ? ` (${failed} failed)` : "")
  );

  return NextResponse.json({
    deleted: succeeded,
    failed,
    ttlHours,
    cutoff: new Date(cutoff).toISOString(),
  });
}
