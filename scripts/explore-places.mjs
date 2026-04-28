// explore-places.mjs
// Google Places API (New) exploration script for Match app Phase 2.
// Queries 22 cuisine categories in Dallas, TX at three radii.
// Outputs a markdown report to stdout.
//
// Usage: PLACES_API_KEY=your_key node scripts/explore-places.mjs > report.md
//
// DO NOT commit this file with an API key hardcoded in it.

const API_KEY = process.env.PLACES_API_KEY;
if (!API_KEY) { console.error('Missing PLACES_API_KEY env var'); process.exit(1); }

const URL = 'https://places.googleapis.com/v1/places:searchNearby';
const DALLAS = { latitude: 32.7767, longitude: -96.7970 };

const RADII = [
  { label: '1 mile',  meters: 1609 },
  { label: '2 miles', meters: 3219 },
  { label: '5 miles', meters: 8047 },
];

const CATEGORIES = [
  { id: 'american',       label: 'American',       type: 'american_restaurant' },
  { id: 'italian',        label: 'Italian',         type: 'italian_restaurant' },
  { id: 'mexican',        label: 'Mexican',         type: 'mexican_restaurant' },
  { id: 'chinese',        label: 'Chinese',         type: 'chinese_restaurant' },
  { id: 'japanese',       label: 'Japanese',        type: 'japanese_restaurant' },
  { id: 'indian',         label: 'Indian',          type: 'indian_restaurant' },
  { id: 'thai',           label: 'Thai',            type: 'thai_restaurant' },
  { id: 'korean',         label: 'Korean',          type: 'korean_restaurant' },
  { id: 'mediterranean',  label: 'Mediterranean',   type: 'mediterranean_restaurant' },
  { id: 'vietnamese',     label: 'Vietnamese',      type: 'vietnamese_restaurant' },
  { id: 'seafood',        label: 'Seafood',         type: 'seafood_restaurant' },
  { id: 'french',         label: 'French',          type: 'french_restaurant' },
  { id: 'pizza',          label: 'Pizza',           type: 'pizza_restaurant' },
  { id: 'burgers',        label: 'Burgers',         type: 'hamburger_restaurant' },
  { id: 'bbq',            label: 'BBQ',             type: 'barbecue_restaurant' },
  { id: 'fast-food',      label: 'Fast food',       type: 'fast_food_restaurant' },
  { id: 'middle-eastern', label: 'Middle Eastern',  type: 'middle_eastern_restaurant' },
  { id: 'ethiopian',      label: 'Ethiopian',       type: 'ethiopian_restaurant' },
  { id: 'filipino',       label: 'Filipino',        type: 'filipino_restaurant' },
  { id: 'caribbean',      label: 'Caribbean',       type: 'caribbean_restaurant' },
  { id: 'latin-american', label: 'Latin American',  type: 'latin_american_restaurant' },
  { id: 'spanish',        label: 'Spanish',         type: 'spanish_restaurant' },
];

const BASIC_FIELDS = [
  'places.displayName',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.types',
].join(',');

const ALL_FIELDS = [
  'places.displayName',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.types',
  'places.editorialSummary',
  'places.regularOpeningHours',
  'places.accessibilityOptions',
  'places.paymentOptions',
  'places.parkingOptions',
  'places.goodForChildren',
  'places.goodForGroups',
  'places.goodForWatchingSports',
  'places.menuForChildren',
  'places.servesCoffee',
  'places.servesBreakfast',
  'places.servesBrunch',
  'places.servesLunch',
  'places.servesDinner',
  'places.servesBeer',
  'places.servesWine',
  'places.servesCocktails',
  'places.servesVegetarianFood',
  'places.outdoorSeating',
  'places.liveMusic',
  'places.delivery',
  'places.dineIn',
  'places.takeout',
  'places.reservable',
  'places.formattedAddress',
  'places.websiteUri',
].join(',');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchNearby(type, radiusMeters, fieldMask, maxResults = 20) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify({
      includedTypes: [type],
      maxResultCount: maxResults,
      locationRestriction: {
        circle: { center: DALLAS, radius: radiusMeters },
      },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.places || [];
}

function ratingBucket(r) {
  if (r == null) return 'no rating';
  if (r < 3.5)  return 'below 3.5';
  if (r < 4.0)  return '3.5–3.9';
  if (r < 4.5)  return '4.0–4.4';
  return '4.5+';
}

function reviewBucket(n) {
  if (n == null) return 'none';
  if (n < 20)   return '<20';
  if (n < 50)   return '20–49';
  if (n < 100)  return '50–99';
  if (n < 500)  return '100–499';
  return '500+';
}

function priceLabel(level) {
  const map = {
    PRICE_LEVEL_FREE: 'free',
    PRICE_LEVEL_INEXPENSIVE: '$',
    PRICE_LEVEL_MODERATE: '$$',
    PRICE_LEVEL_EXPENSIVE: '$$$',
    PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
    PRICE_LEVEL_UNSPECIFIED: '—',
  };
  return map[level] ?? '—';
}

function collectFields(obj, prefix, counts) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && v !== undefined && v !== false && v !== '') {
      counts[key] = (counts[key] || 0) + 1;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      collectFields(v, key, counts);
    }
  }
}

async function main() {
  // ── Part 1: Category coverage at 3 radii ──────────────────────────────
  const results = {};
  console.error('Querying 22 categories × 3 radii (66 requests)...');

  for (const cat of CATEGORIES) {
    results[cat.id] = {};
    for (const radius of RADII) {
      process.stderr.write(`  ${cat.label.padEnd(16)} @ ${radius.label} ... `);
      try {
        const places = await searchNearby(cat.type, radius.meters, BASIC_FIELDS);
        results[cat.id][radius.label] = places;
        process.stderr.write(`${places.length}\n`);
      } catch (e) {
        process.stderr.write(`ERROR: ${e.message}\n`);
        results[cat.id][radius.label] = [];
      }
      await sleep(120);
    }
  }

  // ── Part 2: Field inventory sample ───────────────────────────────────
  console.error('\nCollecting field inventory sample...');
  const samplePlaces = [];
  const sampleCats = ['american', 'japanese', 'mexican', 'thai', 'korean', 'ethiopian', 'italian'];

  for (const catId of sampleCats) {
    if (samplePlaces.length >= 50) break;
    const cat = CATEGORIES.find(c => c.id === catId);
    try {
      const places = await searchNearby(cat.type, 3219, ALL_FIELDS, 10);
      samplePlaces.push(...places);
      console.error(`  ${cat.label}: +${places.length}`);
    } catch (e) {
      console.error(`  ${cat.label}: ERROR - ${e.message}`);
    }
    await sleep(200);
  }
  const sample = samplePlaces.slice(0, 50);
  console.error(`  Sample total: ${sample.length}\n`);

  // ── Build report ──────────────────────────────────────────────────────
  const out = [];
  const line = (...args) => out.push(args.join(''));

  line('# Google Places API — Dallas Exploration Report');
  line('*Match app Phase 2 data exploration*  ');
  line(`*Generated: ${new Date().toLocaleString()}*`);
  line('');
  line('> **Note:** Google Places API (New) returns a maximum of 20 results per');
  line('> query. ✦ indicates the API returned the maximum — actual market size is larger.');
  line('');
  line('---');
  line('');

  // ── Section 1: Category counts ────────────────────────────────────────
  line('## 1 — Category Coverage');
  line('');
  line('| Category | 1 mile | 2 miles | 5 miles |');
  line('|---|---:|---:|---:|');
  for (const cat of CATEGORIES) {
    const r = results[cat.id];
    const fmt = n => n >= 20 ? `**${n} ✦**` : String(n);
    line(`| ${cat.label} | ${fmt(r['1 mile'].length)} | ${fmt(r['2 miles'].length)} | ${fmt(r['5 miles'].length)} |`);
  }
  line('');

  // ── Section 2: Rating distribution ───────────────────────────────────
  line('---');
  line('');
  line('## 2 — Rating Distribution (2-mile radius)');
  line('');
  line('| Category | No rating | <3.5 | 3.5–3.9 | 4.0–4.4 | 4.5+ | Total |');
  line('|---|---:|---:|---:|---:|---:|---:|');
  for (const cat of CATEGORIES) {
    const places = results[cat.id]['2 miles'];
    const b = { 'no rating': 0, 'below 3.5': 0, '3.5–3.9': 0, '4.0–4.4': 0, '4.5+': 0 };
    places.forEach(p => b[ratingBucket(p.rating)]++);
    line(`| ${cat.label} | ${b['no rating']} | ${b['below 3.5']} | ${b['3.5–3.9']} | ${b['4.0–4.4']} | ${b['4.5+']} | ${places.length} |`);
  }
  line('');
  line('### Quality floor simulation — restaurants surviving each rating threshold');
  line('');
  line('| Category | Total | ≥3.5 | ≥4.0 | ≥4.2 | ≥4.5 |');
  line('|---|---:|---:|---:|---:|---:|');
  for (const cat of CATEGORIES) {
    const p = results[cat.id]['2 miles'];
    const rated = p.filter(x => x.rating != null);
    line(`| ${cat.label} | ${p.length} | ${rated.filter(x => x.rating >= 3.5).length} | ${rated.filter(x => x.rating >= 4.0).length} | ${rated.filter(x => x.rating >= 4.2).length} | ${rated.filter(x => x.rating >= 4.5).length} |`);
  }
  line('');

  // ── Section 3: Review count distribution ─────────────────────────────
  line('---');
  line('');
  line('## 3 — Review Count Distribution (2-mile radius)');
  line('');
  line('| Category | <20 | 20–49 | 50–99 | 100–499 | 500+ | Total |');
  line('|---|---:|---:|---:|---:|---:|---:|');
  for (const cat of CATEGORIES) {
    const places = results[cat.id]['2 miles'];
    const b = { '<20': 0, '20–49': 0, '50–99': 0, '100–499': 0, '500+': 0, 'none': 0 };
    places.forEach(p => b[reviewBucket(p.userRatingCount)]++);
    line(`| ${cat.label} | ${(b['<20'] + b['none'])} | ${b['20–49']} | ${b['50–99']} | ${b['100–499']} | ${b['500+']} | ${places.length} |`);
  }
  line('');
  line('### Review floor simulation — restaurants surviving each threshold');
  line('');
  line('| Category | Total | ≥20 | ≥50 | ≥100 |');
  line('|---|---:|---:|---:|---:|');
  for (const cat of CATEGORIES) {
    const p = results[cat.id]['2 miles'];
    line(`| ${cat.label} | ${p.length} | ${p.filter(x => (x.userRatingCount||0) >= 20).length} | ${p.filter(x => (x.userRatingCount||0) >= 50).length} | ${p.filter(x => (x.userRatingCount||0) >= 100).length} |`);
  }
  line('');

  // ── Section 4: Combined floor ─────────────────────────────────────────
  line('---');
  line('');
  line('## 4 — Combined Quality Floor: Rating ≥ 4.0 AND Reviews ≥ 50 (2-mile radius)');
  line('');
  line('| Category | Before | After | % surviving |');
  line('|---|---:|---:|---:|');
  const thinCategories = [];
  for (const cat of CATEGORIES) {
    const p = results[cat.id]['2 miles'];
    const after = p.filter(x => (x.rating||0) >= 4.0 && (x.userRatingCount||0) >= 50);
    const pct = p.length > 0 ? Math.round(after.length / p.length * 100) : 0;
    const flag = after.length < 8 ? ' ⚠' : '';
    line(`| ${cat.label} | ${p.length} | ${after.length}${flag} | ${pct}% |`);
    if (after.length < 8) thinCategories.push({ cat, qualifying: after.length });
  }
  line('');
  line('*⚠ = fewer than 8 qualifying restaurants — likely defaults to graceful expansion*');
  line('');

  // ── Section 5: Price distribution ────────────────────────────────────
  line('---');
  line('');
  line('## 5 — Price Level Distribution (2-mile radius)');
  line('');
  line('| Category | $ | $$ | $$$ | $$$$ | — | Total |');
  line('|---|---:|---:|---:|---:|---:|---:|');
  for (const cat of CATEGORIES) {
    const places = results[cat.id]['2 miles'];
    let p1=0, p2=0, p3=0, p4=0, pN=0;
    for (const p of places) {
      const lbl = priceLabel(p.priceLevel);
      if (lbl === '$') p1++;
      else if (lbl === '$$') p2++;
      else if (lbl === '$$$') p3++;
      else if (lbl === '$$$$') p4++;
      else pN++;
    }
    line(`| ${cat.label} | ${p1} | ${p2} | ${p3} | ${p4} | ${pN} | ${places.length} |`);
  }
  line('');

  // ── Section 6: Field inventory ────────────────────────────────────────
  line('---');
  line('');
  line('## 6 — Field Inventory');
  line('');
  line(`*${sample.length} restaurants sampled across American, Japanese, Mexican, Thai, Korean, Ethiopian, Italian at 2-mile radius.*`);
  line('');

  if (sample.length > 0) {
    const fieldCounts = {};
    sample.forEach(p => collectFields(p, '', fieldCounts));

    const sorted = Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]);
    line('| Field | Populated | % |');
    line('|---|---:|---:|');
    for (const [field, count] of sorted) {
      const pct = Math.round(count / sample.length * 100);
      line(`| \`${field}\` | ${count}/${sample.length} | ${pct}% |`);
    }
    line('');

    line('### Dietary-relevant fields');
    line('');
    const dietaryKw = ['vegetarian', 'vegan', 'gluten', 'halal', 'kosher', 'serves', 'dietary', 'allergen'];
    const dietaryFields = sorted.filter(([f]) => dietaryKw.some(kw => f.toLowerCase().includes(kw)));
    if (dietaryFields.length > 0) {
      line('| Field | Populated | % |');
      line('|---|---:|---:|');
      for (const [field, count] of dietaryFields) {
        const pct = Math.round(count / sample.length * 100);
        line(`| \`${field}\` | ${count}/${sample.length} | ${pct}% |`);
      }
    } else {
      line('*No dietary-relevant field names found in sample.*');
    }
    line('');

    line('### Raw response — first 3 sample restaurants');
    line('');
    for (const place of sample.slice(0, 3)) {
      line(`**${place.displayName?.text ?? 'Unknown'}**`);
      line('```json');
      line(JSON.stringify(place, null, 2));
      line('```');
      line('');
    }
  }

  // ── Section 7: Recovery trigger summary ──────────────────────────────
  line('---');
  line('');
  line('## 7 — Recovery Trigger Assessment');
  line('');
  line('*Recovery trigger = 6 cards. Categories below 8 qualifying results (4.0/50 floor) at 2 miles are flagged as structurally thin.*');
  line('');

  if (thinCategories.length > 0) {
    line('| Category | Qualifying @ 2 mi | Qualifying @ 5 mi |');
    line('|---|---:|---:|');
    for (const { cat, qualifying } of thinCategories) {
      const at5 = results[cat.id]['5 miles'].filter(x => (x.rating||0) >= 4.0 && (x.userRatingCount||0) >= 50).length;
      line(`| ${cat.label} | ${qualifying} | ${at5} |`);
    }
    line('');
    line(`**${thinCategories.length} categories are structurally thin** at 2 miles with a 4.0/50 floor. These will default to graceful expansion in most sessions.`);
  } else {
    line('**All 22 categories return 8+ qualifying restaurants at 2 miles.** Recovery trigger of 6 appears safe.');
  }
  line('');
  line('---');
  line('');
  line('*End of report.*');

  console.log(out.join('\n'));
  console.error('Done.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
