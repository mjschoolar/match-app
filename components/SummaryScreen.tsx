"use client";
// SummaryScreen — V2.0: action layer on the primary match.
//
// V2.0 changes:
//   - Primary match (first complete, or first majority if no complete) gets an action layer:
//     address, "Get directions" link, "Call" button (if phone present), "Website" button (if present).
//   - RestaurantResult now carries real data from the Places API (address, phone, websiteUrl, location).
//   - Legacy RESTAURANTS fallback for prototype sessions without a generated stack.
//   - Card expand/collapse behaviour unchanged.

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { logEvent } from "@/lib/logEvent";
import { Session, RestaurantResult } from "@/lib/types";
import { RESTAURANTS } from "@/lib/constants";

interface Props {
  session: Session;
  sessionId: string;
  participantId: string;
}

// Fallback for legacy prototype sessions: look up knownFor/hours from RESTAURANTS constant
function getLegacyDetail(id: string) {
  return RESTAURANTS.find((r) => r.id === id);
}

// ── Action layer ──────────────────────────────────────────────────────────────

function ActionLayer({ r }: { r: RestaurantResult }) {
  // Fix 1b: use name + address so Google Maps shows the restaurant name as the destination.
  // Fall back to address-only, then coordinates if name+address aren't available.
  const mapsUrl =
    r.name && r.address
      ? `https://maps.google.com/?q=${encodeURIComponent(r.name + " " + r.address)}`
      : r.address
      ? `https://maps.google.com/?q=${encodeURIComponent(r.address)}`
      : r.location
      ? `https://maps.google.com/?q=${r.location.lat},${r.location.lng}`
      : null;

  return (
    <div className="px-4 pb-4 pt-3 border-t border-white/10 space-y-3">
      {/* Address */}
      {r.address && (
        <p className="text-sm text-gray-300 leading-snug">{r.address}</p>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-w-0 py-2.5 bg-white text-gray-950 rounded-xl text-sm font-semibold text-center touch-manipulation"
          >
            Get directions
          </a>
        )}
        {r.phone && (
          <a
            href={`tel:${r.phone}`}
            className="py-2.5 px-4 bg-gray-700 text-white rounded-xl text-sm font-semibold touch-manipulation"
          >
            Call
          </a>
        )}
        {r.websiteUrl && (
          <a
            href={r.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2.5 px-4 bg-gray-700 text-white rounded-xl text-sm font-semibold touch-manipulation"
          >
            Website
          </a>
        )}
      </div>
    </div>
  );
}

// ── Restaurant card ───────────────────────────────────────────────────────────

function RestaurantCard({
  r,
  tier,
  isExpanded,
  showActionLayer,
  onToggle,
}: {
  r: RestaurantResult;
  tier: "complete" | "majority" | "partial";
  isExpanded: boolean;
  showActionLayer: boolean;
  onToggle: () => void;
}) {
  const legacy = getLegacyDetail(r.id);
  const highlight = tier === "complete";
  const price = r.priceLevel ? ["$", "$$", "$$$", "$$$$"][r.priceLevel - 1] : null;
  const reviewText = r.reviewCount > 0
    ? r.reviewCount >= 1000
      ? `${(r.reviewCount / 1000).toFixed(1)}k`
      : `${r.reviewCount}`
    : null;

  return (
    <div
      className={[
        "rounded-xl overflow-hidden transition-all",
        highlight ? "bg-white/10 border border-white/20" : "bg-gray-800",
      ].join(" ")}
    >
      {/* Collapsed row */}
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

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-white/10">
          <div className="px-4 pb-3 pt-3 space-y-3">
            {/* Stats row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="text-white font-medium">★ {r.rating}</span>
              {reviewText && (
                <span className="text-gray-400">{reviewText} reviews</span>
              )}
              {price && <span className="text-gray-300">{price}</span>}
              <span className="text-gray-400">{r.distance}</span>
            </div>

            {/* Legacy knownFor for prototype sessions */}
            {!r.address && legacy?.knownFor && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Known for</p>
                <p className="text-sm text-gray-300">{legacy.knownFor}</p>
              </div>
            )}

            {/* Legacy hours for prototype sessions */}
            {!r.address && legacy?.hours && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Hours</p>
                <p className="text-sm text-gray-300">{legacy.hours}</p>
              </div>
            )}
          </div>

          {/* Action layer — only for the primary match */}
          {showActionLayer && <ActionLayer r={r} />}
        </div>
      )}

      {/* Action layer is always visible on the primary match card
          (not just in expanded state) when it's the top result */}
      {showActionLayer && !isExpanded && (r.address || r.phone || r.websiteUrl || r.location) && (
        <ActionLayer r={r} />
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SummaryScreen({ session, sessionId, participantId }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const completedLoggedRef = useRef(false);

  // Firebase may return arrays as objects with integer keys — normalise
  function toArray(val: unknown): RestaurantResult[] {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    return Object.values(val as Record<string, RestaurantResult>);
  }

  const complete = toArray(session.result?.complete);
  const majority = toArray(session.result?.majority);
  const partial  = toArray(session.result?.partial);
  const hasAnyMatch = complete.length > 0 || majority.length > 0 || partial.length > 0;

  // Log session.completed once on mount, from the creator only
  useEffect(() => {
    if (completedLoggedRef.current) return;
    if (session.creatorId !== participantId) return;
    completedLoggedRef.current = true;
    logEvent(db, sessionId, "session.completed", {
      completeMatchCount: complete.length,
      majorityMatchCount: majority.length,
      partialMatchCount:  partial.length,
      participantCount:   Object.keys(session.participants ?? {}).length,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The primary match is the first complete match, or the first majority match if none
  const primaryMatch = complete[0] ?? majority[0] ?? null;

  function handleToggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleStartOver() {
    window.location.href = "/";
  }

  return (
    <main className="min-h-dvh flex flex-col items-start p-8 bg-gray-950 text-white pt-16">
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
                showActionLayer={true}
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
                showActionLayer={r.id === primaryMatch?.id && complete.length === 0}
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
                showActionLayer={false}
                onToggle={() => handleToggle(r.id)}
              />
            ))}
          </div>
        )}

        {/* ── No matches ── */}
        {!hasAnyMatch && (
          <div className="text-center space-y-2 py-8">
            <p className="text-xl font-semibold">Your tastes were all over the map.</p>
            <p className="text-gray-400 text-sm">
              Nobody agreed on anything — try again with fewer constraints.
            </p>
          </div>
        )}

        {/* ── Start over ── */}
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
