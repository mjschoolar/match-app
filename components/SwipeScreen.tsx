"use client";
// SwipeScreen — V2.0: real restaurant data from Firebase stack.
//
// V2.0 changes:
//   - Reads deck from session.stack.restaurants (StackRestaurant objects from Places API).
//   - Falls back to hardcoded RESTAURANTS if no stack is generated yet.
//   - Card face: name, matchCategory, real photo, "4.7 ★ · 1,847 reviews", price, distance.
//   - Detail layer (tap to expand): editorial summary, open status, address,
//     tap-to-call phone, tap-to-open website, attribute chips.
//   - Match result writes enriched RestaurantResult objects (address, phone, etc.)
//   - Photo fallback: solid bg-gray-700 tile if photoUrl is null or fails to load.
//
// Gesture mechanics, tap threshold, snap-back, exit animation — unchanged from V3.

import { useState, useRef, useEffect } from "react";
import { db } from "@/lib/firebase";
import { ref, set, get } from "firebase/database";
import { Session, StackRestaurant, RestaurantResult } from "@/lib/types";
import { RESTAURANTS } from "@/lib/constants";

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

type AnimPhase = "idle" | "snap-back" | "exit-left" | "exit-right";

// Gesture constants (unchanged)
const TILT_PER_PX      = 1 / 11;
const MAX_TILT_DEG     = 10;
const Y_DAMPEN         = 0.25;
const TAP_THRESHOLD_PX = 8;
const TINT_MAX_OPACITY = 0.18;
const COMMIT_RATIO     = 0.25;
const EXIT_MS          = 280;
const SNAP_MS          = 420;

// ── Price display ─────────────────────────────────────────────────────────────
const PRICE_LABELS: Record<number, string> = { 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };

// ── Normalize Firebase array/object → real array ──────────────────────────────
function normalizeRestaurants(
  val: StackRestaurant[] | Record<string, StackRestaurant> | undefined
): StackRestaurant[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.values(val);
}

// ── Adapt legacy RESTAURANTS constant to StackRestaurant shape ─────────────────
function adaptLegacy(r: (typeof RESTAURANTS)[number]): StackRestaurant {
  const priceIndex = ["$", "$$", "$$$", "$$$$"].indexOf(r.price);
  return {
    id: r.id,
    name: r.name,
    matchCategory: r.cuisine,
    matchCategoryId: "",    // no cuisine ID on legacy cards — hero fallback won't apply
    rating: r.rating,
    reviewCount: 0,
    priceLevel: priceIndex >= 0 ? priceIndex + 1 : null,
    photoUrl: r.image,
    photoReferenceName: null,
    address: "",
    phone: null,
    websiteUrl: null,
    distanceMiles: parseFloat(r.distance),
    location: { lat: 0, lng: 0 },
    editorialSummary: r.knownFor || null,
    closingTime: null,
    isOpenNow: null,
    goodForGroups: null,
    outdoorSeating: null,
    reservable: null,
    takeout: null,
    delivery: null,
    servesDrinks: null,
    wheelchairAccessible: null,
  };
}

// ── Inner card component ──────────────────────────────────────────────────────
function SwipeCard({
  card,
  expanded,
  drag,
  animPhase,
  cardInnerRef,
  isFirstCard,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onToggleExpanded,
}: {
  card: StackRestaurant;
  expanded: boolean;
  drag: { x: number; y: number };
  animPhase: AnimPhase;
  cardInnerRef: React.RefObject<HTMLDivElement | null>;
  isFirstCard: boolean;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onToggleExpanded: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [photoError, setPhotoError] = useState(false);
  const [heroError,  setHeroError]  = useState(false);

  useEffect(() => {
    if (!wrapRef.current) return;
    wrapRef.current.style.animation = "cardAdvance 0.28s ease-out";

    if (!isFirstCard) return;
    const timer = setTimeout(() => {
      if (wrapRef.current) {
        wrapRef.current.style.animation = "cardNudge 0.6s ease-in-out";
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [isFirstCard]);

  const cardWidth = cardInnerRef.current?.getBoundingClientRect().width ?? 320;
  const threshold = cardWidth * COMMIT_RATIO || 144;
  const tilt = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, drag.x * TILT_PER_PX));
  const rawTintOpacity = Math.min(TINT_MAX_OPACITY, (Math.abs(drag.x) / threshold) * TINT_MAX_OPACITY);
  const tintOpacity = animPhase === "snap-back" ? 0 : rawTintOpacity;
  const tintRgb = drag.x >= 0 ? "0, 200, 100" : "255, 60, 60";

  let transform: string;
  let transition: string;

  if (animPhase === "snap-back") {
    transform  = "translate(0px, 0px) rotate(0deg)";
    transition = `transform ${SNAP_MS}ms cubic-bezier(0.175, 0.885, 0.32, 1.275)`;
  } else if (animPhase === "exit-left") {
    transform  = `translate(-130vw, ${drag.y}px) rotate(-22deg)`;
    transition = `transform ${EXIT_MS}ms cubic-bezier(0.4, 0, 1, 1)`;
  } else if (animPhase === "exit-right") {
    transform  = `translate(130vw, ${drag.y}px) rotate(22deg)`;
    transition = `transform ${EXIT_MS}ms cubic-bezier(0.4, 0, 1, 1)`;
  } else {
    transform  = `translate(${drag.x}px, ${drag.y}px) rotate(${tilt}deg)`;
    transition = "none";
  }

  // Photo source resolution:
  //   1. Google Places CDN URL (if resolved and no load error)
  //   2. Cuisine hero image from /public/cuisine-heroes/{id}.jpg (if no hero error)
  //   3. Solid grey — neither source available
  const googlePhoto = card.photoUrl && !photoError ? card.photoUrl : null;
  const heroSrc = card.matchCategoryId ? `/cuisine-heroes/${card.matchCategoryId}.jpg` : null;
  const activeSrc = googlePhoto ?? (!heroError ? heroSrc : null);
  const hasPhoto = !!activeSrc;

  const price = card.priceLevel ? PRICE_LABELS[card.priceLevel] : null;
  const reviewText = card.reviewCount > 0
    ? card.reviewCount >= 1000
      ? `${(card.reviewCount / 1000).toFixed(1)}k reviews`
      : `${card.reviewCount} reviews`
    : null;

  // Attribute chips — only show fields confirmed true
  const attrs: string[] = [];
  if (card.goodForGroups === true)     attrs.push("Good for groups");
  if (card.outdoorSeating === true)    attrs.push("Outdoor seating");
  if (card.reservable === true)        attrs.push("Reservable");
  if (card.takeout === true)           attrs.push("Takeout");
  if (card.delivery === true)          attrs.push("Delivery");
  if (card.servesDrinks === true)      attrs.push("Serves drinks");
  if (card.wheelchairAccessible === true) attrs.push("Wheelchair accessible");

  return (
    <div
      ref={wrapRef}
      style={{ transform, transition, willChange: "transform", zIndex: 1 }}
      className="absolute inset-0"
    >
      <div
        ref={cardInnerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="w-full h-full rounded-3xl overflow-hidden relative touch-none select-none"
        style={
          hasPhoto
            ? {
                backgroundImage: `url(${activeSrc})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundColor: "#374151",
              }
            : { backgroundColor: "#374151" }
        }
      >
        {/* Hidden img tags to detect load errors for both photo sources */}
        {card.photoUrl && (
          <img
            src={card.photoUrl}
            alt=""
            className="hidden"
            onError={() => setPhotoError(true)}
          />
        )}
        {!googlePhoto && heroSrc && (
          <img
            src={heroSrc}
            alt=""
            className="hidden"
            onError={() => setHeroError(true)}
          />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none z-0" />

        {/* Directional tint */}
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none z-10 transition-colors duration-75"
          style={{
            backgroundColor:
              tintOpacity > 0.005 ? `rgba(${tintRgb}, ${tintOpacity})` : "transparent",
          }}
        />

        {/* Card content */}
        <div className="absolute inset-0 flex flex-col justify-end p-6 z-20">

          {/* Expanded detail layer */}
          {expanded && (
            <div className="mb-4 rounded-2xl bg-black/70 p-4 space-y-3 text-sm text-gray-300 backdrop-blur-sm max-h-64 overflow-y-auto">

              {/* Editorial summary */}
              {card.editorialSummary && (
                <p className="text-gray-200 leading-snug">{card.editorialSummary}</p>
              )}

              {/* Open status */}
              {card.isOpenNow !== null && (
                <div className="flex gap-2">
                  <span className={card.isOpenNow ? "text-green-400" : "text-red-400"}>
                    {card.isOpenNow
                      ? card.closingTime ? `Open until ${card.closingTime}` : "Open now"
                      : "Closed"}
                  </span>
                </div>
              )}

              {/* Address */}
              {card.address && (
                <div className="flex gap-2">
                  <span className="text-gray-500 flex-shrink-0">📍</span>
                  <span className="text-gray-300 leading-snug">{card.address}</span>
                </div>
              )}

              {/* Phone */}
              {card.phone && (
                <a
                  href={`tel:${card.phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex gap-2 items-center"
                >
                  <span className="text-gray-500 flex-shrink-0">📞</span>
                  <span className="text-blue-400 underline">{card.phone}</span>
                </a>
              )}

              {/* Website */}
              {card.websiteUrl && (
                <a
                  href={card.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex gap-2 items-center"
                >
                  <span className="text-gray-500 flex-shrink-0">🔗</span>
                  <span className="text-blue-400 underline truncate">
                    {card.websiteUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                  </span>
                </a>
              )}

              {/* Attribute chips */}
              {attrs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {attrs.map((attr) => (
                    <span
                      key={attr}
                      className="text-xs bg-white/10 text-gray-300 rounded-full px-2.5 py-1"
                    >
                      {attr}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Restaurant info row */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-3xl font-bold leading-tight">{card.name}</h2>
              <p className="text-gray-400 mt-1">{card.matchCategory}</p>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm mt-2">
                <span className="text-yellow-400">★ {card.rating}</span>
                {reviewText && (
                  <span className="text-gray-400">{reviewText}</span>
                )}
                {price && (
                  <>
                    <span className="text-gray-600">·</span>
                    <span className="text-gray-300">{price}</span>
                  </>
                )}
                <span className="text-gray-600">·</span>
                <span className="text-gray-300">{card.distanceMiles} mi</span>
              </div>
            </div>

            {/* Detail layer toggle */}
            <button
              onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); onToggleExpanded(); }}
              onClick={(e) => { e.stopPropagation(); onToggleExpanded(); }}
              className={[
                "flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center",
                "text-gray-300 transition-transform duration-200 touch-manipulation",
                expanded ? "rotate-180" : "",
              ].join(" ")}
            >
              ↓
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SwipeScreen({ sessionId, session, participantId }: Props) {
  // Use real stack if available, otherwise fall back to prototype RESTAURANTS
  const realRestaurants = normalizeRestaurants(session.stack?.restaurants);
  const deck: StackRestaurant[] =
    session.stack?.generated && realRestaurants.length > 0
      ? realRestaurants
      : RESTAURANTS.map(adaptLegacy);

  const existing = (session.swipeDecisions?.[participantId] || {}) as Record<string, string>;
  const [decisions, setDecisions] = useState<Record<string, "right" | "left">>(
    existing as Record<string, "right" | "left">
  );
  const [expanded,   setExpanded]   = useState(false);
  const [committing, setCommitting] = useState(false);
  const [drag,       setDrag]       = useState({ x: 0, y: 0 });
  const [animPhase,  setAnimPhase]  = useState<AnimPhase>("idle");

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const cardWidthRef  = useRef(320);
  const cardInnerRef  = useRef<HTMLDivElement>(null);

  const currentIndex = Object.keys(decisions).length;
  const currentCard  = deck[currentIndex];
  const nextCard     = deck[currentIndex + 1];

  // ── Touch handlers (unchanged) ────────────────────────────────────────────

  function onTouchStart(e: React.TouchEvent) {
    if (committing) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    hasDraggedRef.current = false;
    cardWidthRef.current  = cardInnerRef.current?.getBoundingClientRect().width ?? 320;
    if (animPhase !== "idle") setAnimPhase("idle");
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!touchStartRef.current || committing) return;
    const t  = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;

    if (!hasDraggedRef.current && Math.abs(dx) >= TAP_THRESHOLD_PX) {
      hasDraggedRef.current = true;
    }

    if (hasDraggedRef.current) {
      setDrag({ x: dx, y: dy * Y_DAMPEN });
    }
  }

  function onTouchEnd(_e: React.TouchEvent) {
    if (!touchStartRef.current) return;

    if (!hasDraggedRef.current) {
      setExpanded((prev) => !prev);
      touchStartRef.current = null;
      return;
    }

    const threshold = cardWidthRef.current * COMMIT_RATIO;

    if (Math.abs(drag.x) >= threshold) {
      const direction = drag.x > 0 ? "right" : "left";
      setAnimPhase(direction === "right" ? "exit-right" : "exit-left");
      setTimeout(() => commitSwipe(direction), EXIT_MS);
    } else {
      setAnimPhase("snap-back");
      setTimeout(() => {
        setDrag({ x: 0, y: 0 });
        setAnimPhase("idle");
      }, SNAP_MS);
    }

    touchStartRef.current = null;
  }

  // ── Commit a swipe ─────────────────────────────────────────────────────────

  async function commitSwipe(direction: "right" | "left") {
    if (!currentCard || committing) return;
    setCommitting(true);
    setExpanded(false);

    const newDecisions = { ...decisions, [currentCard.id]: direction };
    setDecisions(newDecisions);
    setDrag({ x: 0, y: 0 });
    setAnimPhase("idle");

    await set(
      ref(db, `sessions/${sessionId}/swipeDecisions/${participantId}/${currentCard.id}`),
      direction
    );

    if (Object.keys(newDecisions).length === deck.length) {
      await set(ref(db, `sessions/${sessionId}/swipeComplete/${participantId}`), true);

      // Fresh read from Firebase — don't rely on stale React state.
      // If two devices finish close together, the local session snapshot may
      // not yet reflect the other participant's completion, causing both to
      // see allDone = false and neither to advance the phase.
      const allIds = Object.keys(session.participants || {});
      const snap = await get(ref(db, `sessions/${sessionId}/swipeComplete`));
      const freshComplete = (snap.val() || {}) as Record<string, boolean>;
      const allDone = allIds.every((id) => freshComplete[id] === true);

      if (allDone) {
        const allDecisions = { ...(session.swipeDecisions || {}), [participantId]: newDecisions };
        const result = calculateResults(allDecisions, allIds);
        await set(ref(db, `sessions/${sessionId}/result`), result);
        await set(ref(db, `sessions/${sessionId}/phase`), "anticipation");
      }
    }

    setCommitting(false);
  }

  function tapSwipe(direction: "right" | "left") {
    if (committing) return;
    setAnimPhase(direction === "right" ? "exit-right" : "exit-left");
    setTimeout(() => commitSwipe(direction), EXIT_MS);
  }

  // ── Match calculation ─────────────────────────────────────────────────────

  function calculateResults(
    allDecisions: Record<string, Record<string, string>>,
    allIds: string[]
  ): { complete: RestaurantResult[]; majority: RestaurantResult[]; partial: RestaurantResult[] } {
    const total = allIds.length;
    const participants = session.participants || {};
    const complete: RestaurantResult[] = [];
    const majority: RestaurantResult[] = [];
    const partial: RestaurantResult[] = [];

    for (const r of deck) {
      const matchedIds = allIds.filter((pid) => allDecisions[pid]?.[r.id] === "right");
      const matchedBy = matchedIds.map((pid) => participants[pid]?.name ?? pid);

      const entry: RestaurantResult = {
        id: r.id,
        name: r.name,
        cuisine: r.matchCategory,
        rating: r.rating,
        reviewCount: r.reviewCount,
        priceLevel: r.priceLevel,
        distance: `${r.distanceMiles} mi`,
        photoUrl: r.photoUrl,
        address: r.address,
        phone: r.phone,
        websiteUrl: r.websiteUrl,
        location: r.location,
        matchedBy,
      };

      if (matchedIds.length === total)        complete.push(entry);
      else if (matchedIds.length > total / 2) majority.push(entry);
      else if (matchedIds.length > 0)         partial.push(entry);
    }

    return { complete, majority, partial };
  }

  if (!currentCard) return null;

  return (
    <main className="h-screen flex flex-col items-center justify-center bg-gray-950 text-white overflow-hidden">
      <div className="w-full max-w-sm flex flex-col items-center gap-5 px-4 h-full py-8">

        {/* Card stack area */}
        <div className="relative w-full flex-1 min-h-0">

          {/* Peek card */}
          {nextCard && (
            <div
              className="absolute inset-0 rounded-3xl overflow-hidden"
              style={{
                transform: "scale(0.95) translateY(10px)",
                zIndex: 0,
                backgroundColor: "#374151",
                ...(nextCard.photoUrl
                  ? {
                      backgroundImage: `url(${nextCard.photoUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : {}),
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            </div>
          )}

          {/* Active card */}
          <SwipeCard
            key={currentCard.id}
            card={currentCard}
            expanded={expanded}
            drag={drag}
            animPhase={animPhase}
            cardInnerRef={cardInnerRef}
            isFirstCard={currentIndex === 0}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onToggleExpanded={() => setExpanded((e) => !e)}
          />
        </div>

        {/* Pass / Yes buttons */}
        <div className="grid grid-cols-2 gap-4 w-full flex-shrink-0">
          <button
            onClick={() => tapSwipe("left")}
            disabled={committing}
            className="py-5 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation disabled:opacity-50 transition-colors"
          >
            ✕  Pass
          </button>
          <button
            onClick={() => tapSwipe("right")}
            disabled={committing}
            className="py-5 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-2xl font-semibold text-lg cursor-pointer touch-manipulation disabled:opacity-50 transition-colors"
          >
            ✓  Yes
          </button>
        </div>

      </div>
    </main>
  );
}
