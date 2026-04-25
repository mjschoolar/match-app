"use client";
// SwipeScreen — V3: gesture-driven card swipe with physics feel.
//
// Architecture:
//   - React state drives card position (drag.x, drag.y) and animation phase.
//   - Refs track raw touch coordinates and measured card width — no re-renders
//     during the gesture setup, only during the drag itself.
//   - touch-action: none on the card prevents the browser from intercepting
//     the touch for scrolling, so we don't need e.preventDefault().
//   - key={currentCard.id} remounts the card div on each advance. A useEffect
//     inside the card applies the @keyframes cardAdvance animation on mount,
//     so every new card rises from the peek position naturally.
//   - Tap vs drag: distinguished by 8px horizontal travel threshold.
//   - Depth layer tap (the ↓ button) uses stopPropagation to avoid triggering
//     the parent card's tap handler.

import { useState, useRef, useEffect } from "react";
import { db } from "@/lib/firebase";
import { ref, set } from "firebase/database";
import { Session } from "@/lib/types";
import { RESTAURANTS } from "@/lib/constants";

interface Props {
  sessionId: string;
  session: Session;
  participantId: string;
}

type AnimPhase = "idle" | "snap-back" | "exit-left" | "exit-right";

// Gesture constants
const TILT_PER_PX       = 1 / 11;   // 1° per 11px of horizontal travel
const MAX_TILT_DEG      = 10;        // tilt capped at ±10°
const Y_DAMPEN          = 0.25;      // vertical follow: 25% of actual finger travel
const TAP_THRESHOLD_PX  = 8;        // travel below this = tap, not drag
const TINT_MAX_OPACITY  = 0.18;     // maximum color wash opacity (very subtle)
const COMMIT_RATIO      = 0.25;     // swipe commits at 25% of card width
const EXIT_MS           = 280;      // exit animation duration
const SNAP_MS           = 420;      // snap-back animation duration

function stars(rating: number): string {
  const filled = Math.round(rating);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

// ── Inner card component ────────────────────────────────────────────────────
// Separated so that key={currentCard.id} on this element causes React to fully
// remount it when the card advances. The useEffect then fires fresh on each
// new card and applies the rise-from-peek animation.
function SwipeCard({
  card,
  expanded,
  drag,
  animPhase,
  cardInnerRef,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onToggleExpanded,
}: {
  card: (typeof RESTAURANTS)[number];
  expanded: boolean;
  drag: { x: number; y: number };
  animPhase: AnimPhase;
  cardInnerRef: React.RefObject<HTMLDivElement | null>;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onToggleExpanded: () => void;
}) {
  // The wrapper div gets the keyframe animation on mount — makes every new
  // card rise smoothly from the peek position underneath.
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (wrapRef.current) {
      wrapRef.current.style.animation = "cardAdvance 0.28s ease-out";
    }
  }, []);

  // Derived visual values — recalculated on every drag update
  const cardWidth = cardInnerRef.current?.getBoundingClientRect().width ?? 320;
  const threshold = cardWidth * COMMIT_RATIO || 144;
  const tilt = Math.max(-MAX_TILT_DEG, Math.min(MAX_TILT_DEG, drag.x * TILT_PER_PX));
  const rawTintOpacity = Math.min(TINT_MAX_OPACITY, (Math.abs(drag.x) / threshold) * TINT_MAX_OPACITY);
  // Fade tint out during snap-back so it doesn't linger
  const tintOpacity = animPhase === "snap-back" ? 0 : rawTintOpacity;
  const tintRgb = drag.x >= 0 ? "0, 200, 100" : "255, 60, 60";

  // Build the CSS transform + transition for each animation phase
  let transform: string;
  let transition: string;

  if (animPhase === "snap-back") {
    // Spring curve: eases out then slightly overshoots before settling
    transform  = "translate(0px, 0px) rotate(0deg)";
    transition = `transform ${SNAP_MS}ms cubic-bezier(0.175, 0.885, 0.32, 1.275)`;
  } else if (animPhase === "exit-left") {
    // Accelerates off-screen to the left
    transform  = `translate(-130vw, ${drag.y}px) rotate(-22deg)`;
    transition = `transform ${EXIT_MS}ms cubic-bezier(0.4, 0, 1, 1)`;
  } else if (animPhase === "exit-right") {
    // Accelerates off-screen to the right
    transform  = `translate(130vw, ${drag.y}px) rotate(22deg)`;
    transition = `transform ${EXIT_MS}ms cubic-bezier(0.4, 0, 1, 1)`;
  } else {
    // Live drag — card follows the finger directly, no transition
    transform  = `translate(${drag.x}px, ${drag.y}px) rotate(${tilt}deg)`;
    transition = "none";
  }

  return (
    <div
      ref={wrapRef}
      style={{ transform, transition, willChange: "transform", zIndex: 1 }}
      className="absolute inset-0"
    >
      {/* touch-none: prevents browser scroll from intercepting the touch gesture */}
      <div
        ref={cardInnerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="w-full h-full rounded-3xl bg-gray-800 overflow-hidden relative touch-none select-none"
        style={{ backgroundImage: `url(${card.image})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        {/* Dark gradient — ensures text is readable over the photo */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none z-0" />

        {/* Directional tint — faint red (left) or green (right) wash */}
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none z-10 transition-colors duration-75"
          style={{ backgroundColor: tintOpacity > 0.005 ? `rgba(${tintRgb}, ${tintOpacity})` : "transparent" }}
        />

        {/* Card content — anchored to the bottom of the card face */}
        <div className="absolute inset-0 flex flex-col justify-end p-6 z-20">

          {/* Depth layer — appears above the main info when expanded */}
          {expanded && (
            <div className="mb-4 rounded-2xl bg-black/60 p-4 space-y-2.5 text-sm text-gray-300 backdrop-blur-sm">
              <div className="flex gap-2">
                <span className="text-gray-500 w-24 flex-shrink-0">Price</span>
                <span>{card.price}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 w-24 flex-shrink-0">Known for</span>
                <span>{card.knownFor}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 w-24 flex-shrink-0">Hours</span>
                <span>{card.hours}</span>
              </div>
            </div>
          )}

          {/* Restaurant info row */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-3xl font-bold leading-tight">{card.name}</h2>
              <p className="text-gray-400 mt-1">{card.cuisine}</p>
              <div className="flex items-center gap-3 text-sm mt-2">
                <span className="text-yellow-400 tracking-tight">{stars(card.rating)}</span>
                <span className="text-gray-300">{card.rating}</span>
                <span className="text-gray-600">·</span>
                <span className="text-gray-300">{card.distance}</span>
              </div>
            </div>

            {/* Depth layer toggle — stopPropagation prevents the card's own tap handler firing */}
            <button
              onTouchEnd={(e) => { e.stopPropagation(); onToggleExpanded(); }}
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

// ── Main component ──────────────────────────────────────────────────────────
export default function SwipeScreen({ sessionId, session, participantId }: Props) {
  // Initialise decisions from Firebase — handles mid-swipe page refresh
  const existing = (session.swipeDecisions?.[participantId] || {}) as Record<string, string>;
  const [decisions, setDecisions] = useState<Record<string, "right" | "left">>(
    existing as Record<string, "right" | "left">
  );
  const [expanded,   setExpanded]   = useState(false);
  const [committing, setCommitting] = useState(false);
  const [drag,       setDrag]       = useState({ x: 0, y: 0 });
  const [animPhase,  setAnimPhase]  = useState<AnimPhase>("idle");

  // Touch tracking — stored in refs so updates don't trigger renders
  const touchStartRef   = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef   = useRef(false);
  const cardWidthRef    = useRef(320);
  const cardInnerRef    = useRef<HTMLDivElement>(null);

  const currentIndex = Object.keys(decisions).length;
  const currentCard  = RESTAURANTS[currentIndex];
  const nextCard     = RESTAURANTS[currentIndex + 1];

  // ── Touch handlers ────────────────────────────────────────────────────────

  function onTouchStart(e: React.TouchEvent) {
    if (committing) return;
    const t = e.touches[0];
    touchStartRef.current  = { x: t.clientX, y: t.clientY };
    hasDraggedRef.current  = false;
    cardWidthRef.current   = cardInnerRef.current?.getBoundingClientRect().width ?? 320;
    // Reset any lingering animation so the card responds immediately
    if (animPhase !== "idle") setAnimPhase("idle");
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!touchStartRef.current || committing) return;
    const t  = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;

    // Cross the 8px threshold → this is a drag, not a tap
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
      // Didn't move enough to be a drag — treat as a tap → toggle depth layer
      setExpanded((prev) => !prev);
      touchStartRef.current = null;
      return;
    }

    const threshold = cardWidthRef.current * COMMIT_RATIO;

    if (Math.abs(drag.x) >= threshold) {
      // Past threshold — commit the swipe
      const direction = drag.x > 0 ? "right" : "left";
      setAnimPhase(direction === "right" ? "exit-right" : "exit-left");
      setTimeout(() => commitSwipe(direction), EXIT_MS);
    } else {
      // Didn't reach threshold — snap back to center with spring
      setAnimPhase("snap-back");
      setTimeout(() => {
        setDrag({ x: 0, y: 0 });
        setAnimPhase("idle");
      }, SNAP_MS);
    }

    touchStartRef.current = null;
  }

  // ── Commit a swipe decision ───────────────────────────────────────────────

  async function commitSwipe(direction: "right" | "left") {
    if (!currentCard || committing) return;
    setCommitting(true);
    setExpanded(false);

    const newDecisions = { ...decisions, [currentCard.id]: direction };
    setDecisions(newDecisions);
    setDrag({ x: 0, y: 0 });
    setAnimPhase("idle");

    // Write to Firebase
    await set(
      ref(db, `sessions/${sessionId}/swipeDecisions/${participantId}/${currentCard.id}`),
      direction
    );

    // If all cards done, mark complete and potentially trigger end
    if (Object.keys(newDecisions).length === RESTAURANTS.length) {
      await set(ref(db, `sessions/${sessionId}/swipeComplete/${participantId}`), true);

      const allIds = Object.keys(session.participants || {});
      const updatedComplete = { ...(session.swipeComplete || {}), [participantId]: true };
      const allDone = allIds.every((id) => updatedComplete[id] === true);

      if (allDone) {
        const allDecisions = { ...(session.swipeDecisions || {}), [participantId]: newDecisions };
        const result = calculateResults(allDecisions, allIds);
        await set(ref(db, `sessions/${sessionId}/result`), result);
        await set(ref(db, `sessions/${sessionId}/phase`), "anticipation");
      }
    }

    setCommitting(false);
  }

  // Trigger exit animation then commit — used by the tap buttons
  function tapSwipe(direction: "right" | "left") {
    if (committing) return;
    setAnimPhase(direction === "right" ? "exit-right" : "exit-left");
    setTimeout(() => commitSwipe(direction), EXIT_MS);
  }

  // ── Match calculation (unchanged from V2) ─────────────────────────────────

  function calculateResults(
    allDecisions: Record<string, Record<string, string>>,
    allIds: string[]
  ) {
    const total = allIds.length;
    const complete = [], majority = [], partial = [];
    for (const r of RESTAURANTS) {
      const rightCount = allIds.filter((pid) => allDecisions[pid]?.[r.id] === "right").length;
      const entry = { id: r.id, name: r.name, cuisine: r.cuisine, rating: r.rating, distance: r.distance };
      if (rightCount === total)        complete.push(entry);
      else if (rightCount > total / 2) majority.push(entry);
      else if (rightCount > 0)         partial.push(entry);
    }
    return { complete, majority, partial };
  }

  if (!currentCard) return null;

  return (
    <main className="h-screen flex flex-col items-center justify-center bg-gray-950 text-white overflow-hidden">
      <div className="w-full max-w-sm flex flex-col items-center gap-5 px-4 h-full py-8">

        {/* ── Card stack area — fills available height ── */}
        <div className="relative w-full flex-1 min-h-0">

          {/* Peek card — photo + gradient, no content (content reveals when the card rises) */}
          {nextCard && (
            <div
              className="absolute inset-0 rounded-3xl bg-gray-800 overflow-hidden"
              style={{
                transform: "scale(0.95) translateY(10px)",
                zIndex: 0,
                backgroundImage: `url(${nextCard.image})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            </div>
          )}

          {/* Active card — key remounts on each new card so the advance animation fires */}
          <SwipeCard
            key={currentCard.id}
            card={currentCard}
            expanded={expanded}
            drag={drag}
            animPhase={animPhase}
            cardInnerRef={cardInnerRef}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onToggleExpanded={() => setExpanded((e) => !e)}
          />
        </div>

        {/* ── Pass / Yes tap buttons (gesture fallback) ── */}
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
