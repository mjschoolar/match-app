"use client";
// SummaryScreen — the final reveal.
//
// Shows the full match hierarchy derived from actual swipe data:
//   Complete matches  — every participant swiped right
//   Majority matches  — more than half swiped right
//   Partial matches   — at least one person swiped right
//
// The result was calculated by the last participant to finish swiping
// and written to Firebase before this phase was triggered. We just
// read and display it here.

import { Session, RestaurantResult } from "@/lib/types";

interface Props {
  session: Session;
}

function RestaurantCard({ r, highlight }: { r: RestaurantResult; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl px-4 py-3 flex items-center justify-between gap-3
        ${highlight ? "bg-white/10 border border-white/20" : "bg-gray-800"}`}
    >
      <div>
        <p className="font-semibold">{r.name}</p>
        <p className="text-sm text-gray-400">{r.cuisine} · {r.distance}</p>
      </div>
      <span className="text-sm text-gray-400 flex-shrink-0">★ {r.rating}</span>
    </div>
  );
}

export default function SummaryScreen({ session }: Props) {
  // Firebase may return arrays as objects with integer keys — normalise both
  function toArray(val: unknown): RestaurantResult[] {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return Object.values(val as Record<string, RestaurantResult>);
  }

  const complete = toArray(session.result?.complete);
  const majority = toArray(session.result?.majority);
  const partial = toArray(session.result?.partial);
  const hasAnyMatch = complete.length > 0 || majority.length > 0;

  return (
    <main className="min-h-screen flex flex-col items-start p-8 bg-gray-950 text-white pt-16">
      <div className="max-w-sm w-full space-y-6">

        <h1 className="text-3xl font-bold">Here&apos;s where you landed.</h1>

        {/* ── Complete matches ── */}
        {complete.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 uppercase tracking-widest">
              Everyone said yes
            </p>
            {complete.map((r) => (
              <RestaurantCard key={r.id} r={r} highlight />
            ))}
          </div>
        )}

        {/* ── Majority matches ── */}
        {majority.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 uppercase tracking-widest">
              Most of you
            </p>
            {majority.map((r) => (
              <RestaurantCard key={r.id} r={r} />
            ))}
          </div>
        )}

        {/* ── Partial matches ── */}
        {partial.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 uppercase tracking-widest">
              Some of you
            </p>
            {partial.map((r) => (
              <RestaurantCard key={r.id} r={r} />
            ))}
          </div>
        )}

        {/* ── No matches at all ── */}
        {!hasAnyMatch && partial.length === 0 && (
          <div className="text-center space-y-2 py-8">
            <p className="text-xl font-semibold">Your tastes were all over the map.</p>
            <p className="text-gray-400 text-sm">Nobody agreed on anything — try again with fewer constraints.</p>
          </div>
        )}

      </div>
    </main>
  );
}
