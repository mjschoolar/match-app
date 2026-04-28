// scripts/session-log-reader.mjs
// Reads a session's event log from Firebase and prints a formatted report.
//
// Usage: node scripts/session-log-reader.mjs <SESSION_ID>
// Example: node scripts/session-log-reader.mjs MATCH7F

import { initializeApp, getApps } from "firebase/app";
import { getDatabase, ref, get } from "firebase/database";

// ── Firebase config (mirrors lib/firebase.ts) ─────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBXeNYWi4VxbAKdhdogoUvSyckvSEYdN2c",
  authDomain: "match-test-36175.firebaseapp.com",
  databaseURL: "https://match-test-36175-default-rtdb.firebaseio.com",
  projectId: "match-test-36175",
  storageBucket: "match-test-36175.firebasestorage.app",
  messagingSenderId: "304695829208",
  appId: "1:304695829208:web:6817d4b3609ed1e57badad",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db  = getDatabase(app);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElapsed(ms) {
  if (ms < 60000) return `+${ms.toLocaleString()}ms`;
  const totalSec = Math.floor(ms / 1000);
  const minutes  = Math.floor(totalSec / 60);
  const secs     = totalSec % 60;
  const millis   = ms % 1000;
  return `+${minutes}:${String(secs).padStart(2, "0")}:${String(millis).padStart(3, "0")}`;
}

function formatDuration(ms) {
  if (!ms && ms !== 0) return "?ms";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function pad(str, len) {
  return String(str ?? "").padEnd(len);
}

function rpad(str, len) {
  return String(str ?? "").padStart(len);
}

function summarise(entry) {
  switch (entry.event) {
    case "session.created":
      return `${entry.locationLabel ?? ""} (${(entry.lat ?? 0).toFixed(4)}, ${(entry.lng ?? 0).toFixed(4)})`;
    case "pool.p1.started":
      return `(${(entry.lat ?? 0).toFixed(4)}, ${(entry.lng ?? 0).toFixed(4)})`;
    case "pool.p1.completed": {
      const tokens = (entry.categoriesWithTokens ?? []).length;
      return `${formatDuration(entry.durationMs)} | ${entry.totalQualifying ?? 0} qualifying | ${tokens} tokens`;
    }
    case "pool.p2.started":
      return `${(entry.categoriesToFetch ?? []).length} categories`;
    case "pool.p2.completed": {
      const tokens = (entry.categoriesWithTokens ?? []).length;
      return `${formatDuration(entry.durationMs)} | ${entry.totalNewQualifying ?? 0} new qualifying | ${tokens} tokens`;
    }
    case "pool.p3.started":
      return `${(entry.categoriesToFetch ?? []).length} categories`;
    case "pool.p3.completed":
      return `${formatDuration(entry.durationMs)} | ${entry.totalNewQualifying ?? 0} new qualifying | pool complete`;
    case "generate.started": {
      const cats = (entry.selectedCategories ?? []).join(", ");
      return `path: ${entry.path} | ${entry.sessionDistance ?? "?"}mi | ${entry.sessionPrice ?? "?"} | [${cats}]`;
    }
    case "generate.filters.applied": {
      if (entry.path === "fallback") return `(fallback path — single-pass filter)`;
      return `pool: ${entry.poolTotal ?? "?"} → dist: ${entry.afterDistanceFilter ?? "?"} → open: ${entry.afterOpenHours ?? "?"} → price: ${entry.afterPriceFilter ?? "?"} → dedup: ${entry.afterDedup ?? "?"}`;
    }
    case "generate.expansion.completed":
      return `${(entry.expandedCategories ?? []).join(", ")} → +${entry.addedCount ?? 0} (total: ${entry.newTotal ?? 0})`;
    case "generate.thin_pool":
      return `⚠️  only ${entry.qualifyingCount ?? 0} qualifying (threshold: ${entry.threshold ?? 0})`;
    case "generate.details.completed":
      return `${entry.succeeded ?? 0}/${entry.requested ?? 0} succeeded | ${entry.failed ?? 0} failed | ${entry.closedPermanently ?? 0} permanently closed`;
    case "generate.stack.written":
      return `${formatDuration(entry.durationMs)} | ${entry.restaurantCount ?? 0} restaurants | ${(entry.categoriesRepresented ?? []).length} categories${entry.poolDeleted ? " | pool deleted" : ""}`;
    case "fill_photos.started":
      return `${entry.nullPhotoCount ?? 0} null photos`;
    case "fill_photos.completed":
      return `${formatDuration(entry.durationMs)} | ${entry.resolved ?? 0}/${entry.attempted ?? 0} resolved`;
    case "session.created":
      return `${entry.locationLabel ?? ""}`;
    case "session.preferences.captured": {
      const posCount = Object.values(entry.positive ?? {}).flat().length;
      const negCount = Object.values(entry.negative ?? {}).flat().length;
      return `${posCount} positive picks, ${negCount} negative picks`;
    }
    case "session.veto.captured": {
      const vetoCount = Object.values(entry.vetos ?? {}).filter(v => v && v !== "null").length;
      return `${vetoCount} veto(s)`;
    }
    case "session.setup.complete": {
      const distances = Object.values(entry.distance ?? {}).join(", ");
      const prices = Object.values(entry.price ?? {}).join(", ");
      return `distance: [${distances}]mi | price: [${prices}] | ${entry.participantCount ?? "?"}p`;
    }
    case "session.swiping.started":
      return `${entry.participantCount ?? "?"} participants`;
    case "session.completed":
      return `${entry.completeMatchCount ?? 0} complete | ${entry.majorityMatchCount ?? 0} majority | ${entry.partialMatchCount ?? 0} partial`;
    case "phase.advanced":
      return `${entry.from} → ${entry.to} (${formatDuration(entry.durationMs)})`;
    case "error":
      return `⚠️  [${entry.route ?? "?"}] ${entry.message ?? "unknown error"}`;
    default:
      return "";
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Usage: node scripts/session-log-reader.mjs <SESSION_ID>");
    process.exit(1);
  }

  console.log(`\nFetching log for session ${sessionId}...`);

  const logSnap = await get(ref(db, `sessions/${sessionId}/log`));
  if (!logSnap.exists()) {
    console.log(`No log found for session ${sessionId}.`);
    console.log("Make sure the session exists and v2.2.1 instrumentation is deployed.");
    process.exit(0);
  }

  const rawEntries = logSnap.val();
  const entries = Object.values(rawEntries)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  if (entries.length === 0) {
    console.log("Log is empty.");
    process.exit(0);
  }

  const sessionStart = entries[0].timestamp ?? Date.now();

  // ── Timeline ──────────────────────────────────────────────────────────────
  console.log(`\nSESSION LOG — ${sessionId}`);
  console.log("─".repeat(72));

  for (const entry of entries) {
    const elapsed   = (entry.timestamp ?? 0) - sessionStart;
    const elapsedFmt = formatElapsed(elapsed).padEnd(14);
    const eventFmt   = (entry.event ?? "?").padEnd(34);
    const summary    = summarise(entry);
    console.log(`  ${elapsedFmt} ${eventFmt} ${summary}`);
  }

  // ── Key measurements ──────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(72));
  console.log("KEY MEASUREMENTS");
  console.log("─".repeat(72));

  const p1Started   = entries.find(e => e.event === "pool.p1.started");
  const p3Completed = entries.find(e => e.event === "pool.p3.completed");
  const genStarted  = entries.find(e => e.event === "generate.started");
  const genWritten  = entries.find(e => e.event === "generate.stack.written");

  if (p1Started && p3Completed) {
    const poolDuration = (p3Completed.timestamp ?? 0) - (p1Started.timestamp ?? 0);
    console.log(`\nPOOL BUILD`);
    console.log(`  Total duration:    ${formatDuration(poolDuration)} (p1.started → p3.completed)`);

    if (genStarted && p3Completed) {
      const leadTime = (genStarted.timestamp ?? 0) - (p3Completed.timestamp ?? 0);
      if (leadTime > 0) {
        const mins = Math.floor(leadTime / 60000);
        const secs = Math.floor((leadTime % 60000) / 1000);
        const leadStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        console.log(`  Pool ready before generate: YES (${leadStr} lead time)`);
      } else {
        console.log(`  Pool ready before generate: NO — fallback path likely fired`);
      }
    }
  }

  if (genStarted && genWritten) {
    const genDuration = genWritten.durationMs ?? ((genWritten.timestamp ?? 0) - (genStarted.timestamp ?? 0));
    const target = 2000;
    const flag = genDuration <= target ? "✓" : "⚠️  OVER TARGET";
    console.log(`\nSTACK GENERATION`);
    console.log(`  Path taken:        ${genStarted.path ?? "?"}`);
    console.log(`  Duration:          ${formatDuration(genDuration)} ${flag} (target: <${formatDuration(target)})`);
    console.log(`  Restaurants:       ${genWritten.restaurantCount ?? "?"} / 25`);
    if (genWritten.poolDeleted) {
      console.log(`  Pool deleted:      yes`);
    }
    if ((genWritten.closedPermanently ?? 0) > 0) {
      console.log(`  Permanently closed skipped: ${genWritten.closedPermanently}`);
    }
  }

  const fillCompleted = entries.find(e => e.event === "fill_photos.completed");
  if (fillCompleted) {
    console.log(`\nPHOTOS`);
    console.log(`  Fill-photos resolved: ${fillCompleted.resolved ?? 0} / ${fillCompleted.attempted ?? 0} (${formatDuration(fillCompleted.durationMs)})`);
  }

  const swipeDistEntry = entries.find(e => e.event === "session.swipe.distribution");
  if (swipeDistEntry?.distribution) {
    const dist = swipeDistEntry.distribution;
    const rightCounts = Object.values(dist).map(d => d.right ?? 0);
    const maxRight = Math.max(...rightCounts);
    const totalSwipes = Object.values(dist).reduce((sum, d) => sum + (d.right ?? 0) + (d.left ?? 0), 0);
    console.log(`\nSWIPES`);
    console.log(`  Total decisions:   ${totalSwipes}`);
    console.log(`  Max right swipes:  ${maxRight} (out of ${swipeDistEntry.participantCount ?? "?"} participants)`);
  }

  const sessionCompleted = entries.find(e => e.event === "session.completed");
  if (sessionCompleted) {
    console.log(`\nMATCHES`);
    console.log(`  Complete:  ${sessionCompleted.completeMatchCount ?? 0}`);
    console.log(`  Majority:  ${sessionCompleted.majorityMatchCount ?? 0}`);
    console.log(`  Partial:   ${sessionCompleted.partialMatchCount ?? 0}`);
  }

  const errors = entries.filter(e => e.event === "error");
  if (errors.length > 0) {
    console.log(`\n⚠️  ERRORS (${errors.length})`);
    for (const err of errors) {
      console.log(`  [${err.route ?? "?"}] ${err.message ?? "unknown"}`);
    }
  }

  // ── Filter pipeline ───────────────────────────────────────────────────────
  const filtersApplied = entries.find(e => e.event === "generate.filters.applied" && e.path === "pool");
  if (filtersApplied?.perCategory) {
    console.log("\n" + "─".repeat(72));
    console.log("FILTER PIPELINE (pool path)");
    console.log("─".repeat(72));
    console.log(
      `  ${pad("Category", 16)} ${rpad("Pool", 6)} ${rpad("Venue", 6)} ${rpad("Dist", 6)} ${rpad("Open", 6)} ${rpad("Price", 6)} ${rpad("Dedup", 6)} ${rpad("Final", 6)}`
    );
    console.log("  " + "─".repeat(62));

    const cats = Object.entries(filtersApplied.perCategory)
      .sort((a, b) => (b[1].pool ?? 0) - (a[1].pool ?? 0));

    for (const [id, counts] of cats) {
      const c = counts;
      console.log(
        `  ${pad(id, 16)} ${rpad(c.pool ?? 0, 6)} ${rpad(c.venue ?? 0, 6)} ${rpad(c.distance ?? 0, 6)} ${rpad(c.openHours ?? 0, 6)} ${rpad(c.price ?? 0, 6)} ${rpad(c.dedup ?? 0, 6)} ${rpad(c.dedup ?? 0, 6)}`
      );
    }

    // Totals row
    const totals = cats.reduce((acc, [, c]) => ({
      pool: acc.pool + (c.pool ?? 0),
      venue: acc.venue + (c.venue ?? 0),
      distance: acc.distance + (c.distance ?? 0),
      openHours: acc.openHours + (c.openHours ?? 0),
      price: acc.price + (c.price ?? 0),
      dedup: acc.dedup + (c.dedup ?? 0),
    }), { pool: 0, venue: 0, distance: 0, openHours: 0, price: 0, dedup: 0 });

    console.log("  " + "─".repeat(62));
    console.log(
      `  ${pad("TOTAL", 16)} ${rpad(totals.pool, 6)} ${rpad(totals.venue, 6)} ${rpad(totals.distance, 6)} ${rpad(totals.openHours, 6)} ${rpad(totals.price, 6)} ${rpad(totals.dedup, 6)} ${rpad(totals.dedup, 6)}`
    );
  }

  // ── Swipe distribution ────────────────────────────────────────────────────
  if (swipeDistEntry?.distribution) {
    console.log("\n" + "─".repeat(72));
    console.log("SWIPE DISTRIBUTION");
    console.log("─".repeat(72));
    console.log(`  ${pad("Restaurant", 28)} ${rpad("Right", 8)} ${rpad("Left", 8)}`);
    console.log("  " + "─".repeat(48));

    const dist = Object.entries(swipeDistEntry.distribution)
      .sort((a, b) => (b[1].right ?? 0) - (a[1].right ?? 0));

    for (const [, d] of dist) {
      const name = (d.name ?? "?").slice(0, 27);
      console.log(`  ${pad(name, 28)} ${rpad(d.right ?? 0, 8)} ${rpad(d.left ?? 0, 8)}`);
    }
  }

  // ── Phase timing ─────────────────────────────────────────────────────────
  const phaseEvents = entries.filter(e => e.event === "phase.advanced");
  if (phaseEvents.length > 0) {
    console.log("\n" + "─".repeat(72));
    console.log("PHASE TIMING");
    console.log("─".repeat(72));
    console.log(`  ${pad("Phase", 28)} ${rpad("Duration", 12)}`);
    console.log("  " + "─".repeat(44));
    for (const ph of phaseEvents) {
      console.log(`  ${pad(ph.from ?? "?", 28)} ${rpad(formatDuration(ph.durationMs), 12)}`);
    }
  }

  // ── Preference & veto summary ─────────────────────────────────────────────
  const prefEntry  = entries.find(e => e.event === "session.preferences.captured");
  const vetoEntry  = entries.find(e => e.event === "session.veto.captured");
  const setupEntry = entries.find(e => e.event === "session.setup.complete");

  if (prefEntry || vetoEntry || setupEntry) {
    console.log("\n" + "─".repeat(72));
    console.log("SESSION INPUTS");
    console.log("─".repeat(72));
  }

  if (setupEntry) {
    console.log(`\n  Dine-in votes:  ${JSON.stringify(setupEntry.dineIn ?? {})}`);
    console.log(`  Distance votes: ${JSON.stringify(setupEntry.distance ?? {})}`);
    console.log(`  Price votes:    ${JSON.stringify(setupEntry.price ?? {})}`);
  }

  if (prefEntry) {
    const positiveMap = prefEntry.positive ?? {};
    const negativeMap = prefEntry.negative ?? {};

    // Tally positive picks across participants
    const positiveTally = {};
    for (const picks of Object.values(positiveMap)) {
      for (const id of (picks ?? [])) {
        positiveTally[id] = (positiveTally[id] ?? 0) + 1;
      }
    }
    // Tally negative picks
    const negativeTally = {};
    for (const picks of Object.values(negativeMap)) {
      for (const id of (picks ?? [])) {
        negativeTally[id] = (negativeTally[id] ?? 0) + 1;
      }
    }

    const topPositive = Object.entries(positiveTally)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, n]) => `${id}(${n})`)
      .join(", ");
    const topNegative = Object.entries(negativeTally)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, n]) => `${id}(${n})`)
      .join(", ");

    console.log(`\n  Top positive:   ${topPositive || "(none)"}`);
    console.log(`  Top negative:   ${topNegative || "(none)"}`);
  }

  if (vetoEntry) {
    const vetoList = Object.values(vetoEntry.vetos ?? {})
      .filter(v => v && v !== "null" && v !== null)
      .join(", ");
    console.log(`  Vetos:          ${vetoList || "(none)"}`);
  }

  console.log("\n" + "─".repeat(72) + "\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error reading session log:", err);
  process.exit(1);
});
