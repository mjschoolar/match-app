"use client";
// SummaryScreen — the final reveal.
//
// V2 changes:
//   - Cards are collapsed by default. All tiers visible simultaneously.
//   - Single-card accordion: tapping opens the full depth layer;
//     opening a second card collapses the first.
//   - Expanded view includes: price, distance, rating, known for, hours
//     (looked up from RESTAURANTS constant by id).
//   - "Start over" button navigates each participant back to home individually.

import { useState } from "react";
import { Session, RestaurantResult } from "@/lib/types";
import { RESTAURANTS } from "@/lib/constants";

interface Props {
  session: Session;
}

// Look up the extra fields (price, knownFor, hours) from the static data
function getRestaurantDetail(id: string) {
  return RESTAURANTS.find((r) => r.id === id);
}

function RestaurantCard({
  r,
  tier,
  isExpanded,
  onToggle,
}: {
  r: RestaurantResult;
  tier: "complete" | "majority" | "partial";
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const detail = getRestaurantDetail(r.id);
  const highlight = tier === "complete";

  return (
    <div
      className={[
        "rounded-xl overflow-hidden transition-all",
        highlight ? "bg-white/10 border border-white/20" : "bg-gray-800",
      ].join(" ")}
    >
      {/* ── Collapsed row — always visible ── */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left cursor-pointer touch-manipulation"
      >
        <div className="min-w-0">
          <p className="font-semibold truncate">{r.name}</p>
          <p className="text-sm text-gray-400 truncate">{r.cuisine}</p>
          {r.matchedBy?.length > 0 && (
            <p className="text-xs text-gray-500 mt-0.5">{r.matchedBy.join(", ")}</p>
          )}
        </div>
        <span
          className={[
            "text-gray-400 text-lg flex-shrink-0 transition-transform duration-200",
            isExpanded ? "rotate-180" : "",
          ].join(" ")}
        >
          ↓
        </span>
      </button>

      {/* ── Expanded depth layer ── */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
          {/* Key stats row */}
          <div className="flex gap-4 text-sm">
            <span className="text-white font-medium">★ {r.rating}</span>
            {detail?.price && (
              <span className="text-gray-300">{detail.price}</span>
            )}
            <span className="text-gray-400">{r.distance}</span>
          </div>

          {/* Known for */}
          {detail?.knownFor && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Known for</p>
              <p className="text-sm text-gray-300">{detail.knownFor}</p>
            </div>
          )}

          {/* Hours */}
          {detail?.hours && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Hours</p>
              <p className="text-sm text-gray-300">{detail.hours}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SummaryScreen({ session }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Firebase may return arrays as objects with integer keys — normalise both
  function toArray(val: unknown): RestaurantResult[] {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return Object.values(val as Record<string, RestaurantResult>);
  }

  const complete = toArray(session.result?.complete);
  const majority = toArray(session.result?.majority);
  const partial = toArray(session.result?.partial);
  const hasAnyMatch = complete.length > 0 || majority.length > 0 || partial.length > 0;

  function handleToggle(id: string) {
    // If this card is already open, close it. Otherwise open it (and close any other).
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleStartOver() {
    window.location.href = "/";
  }

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
              <RestaurantCard
                key={r.id}
                r={r}
                tier="complete"
                isExpanded={expandedId === r.id}
                onToggle={() => handleToggle(r.id)}
              />
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
              <RestaurantCard
                key={r.id}
                r={r}
                tier="majority"
                isExpanded={expandedId === r.id}
                onToggle={() => handleToggle(r.id)}
              />
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
              <RestaurantCard
                key={r.id}
                r={r}
                tier="partial"
                isExpanded={expandedId === r.id}
                onToggle={() => handleToggle(r.id)}
              />
            ))}
          </div>
        )}

        {/* ── No matches at all ── */}
        {!hasAnyMatch && (
          <div className="text-center space-y-2 py-8">
            <p className="text-xl font-semibold">Your tastes were all over the map.</p>
            <p className="text-gray-400 text-sm">Nobody agreed on anything — try again with fewer constraints.</p>
          </div>
        )}

        {/* ── Restart — each participant navigates home independently ── */}
        <button
          onClick={handleStartOver}
          className="w-full py-4 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation mt-4"
        >
          Start over
        </button>

      </div>
    </main>
  );
}
