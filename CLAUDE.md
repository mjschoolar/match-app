# Match App — Prototype Brief
*Context document for Claude Code. Read this before writing any code.*

---

## Who I am and how we're working

I am a product designer with no coding background. I'm building this prototype using Claude Code as my primary coding assistant. Please:

- Explain what you're building and why as you go — assume I won't understand code without narration
- Build one thing at a time and confirm it works before moving to the next
- When you make an architectural decision, tell me what it is and why you chose it
- If something I ask for would cause problems, tell me before doing it
- Keep the code as simple as possible — this is a prototype, not a production app

---

## What this is

A real-time multi-device group decision app for choosing where to eat. A group of 2–5 people open the app on their individual phones, go through a short shared setup sequence together, then each privately swipe through a stack of restaurant cards. The app surfaces where preferences overlapped.

The core mechanic is social: responses to setup questions appear on everyone's screen in real time, and at the end of the setup sequence, everyone's food preferences are revealed simultaneously across all devices.

This prototype is not the full product. It exists to test the live mechanics — the parts of the experience that require real-time sync across devices and can't be validated with a static design mockup.

---

## Tech stack — decided, please don't re-suggest alternatives

- **Framework:** Next.js (React)
- **Real-time database:** Firebase Realtime Database (not Firestore)
- **Deployment:** Vercel (connected to GitHub)
- **Styling:** Tailwind CSS — functional, minimal, mobile-first

These decisions are final for this prototype.

---

## Prototype scope

### In scope — build these
- Session creation (generates a 6-character join code)
- Session join via code entry
- Live participant lobby (names appear as people join)
- Pre-swipe voting steps with live response visibility and reveals
- Preference step: private selection followed by simultaneous reveal across all devices
- Waiting state: shown to participants who finish the swipe stack before others
- Anticipation beat: brief simultaneous signal on all devices when the last participant finishes
- Bare-bones end summary showing match hierarchy

### Out of scope — do not build these
- Real restaurant data (use hardcoded fake cards)
- QR code generation
- User authentication or accounts
- Swipe gesture physics (left/right buttons are fine)
- Actual dietary restriction filtering logic
- Real match calculation algorithm (derive from actual swipe data — see below)
- Any visual polish — functional UI only

---

## Data model

The entire session state lives in a single Firebase Realtime Database document. The `phase` field is the single source of truth — every device renders based on the current phase and the data beneath it.

```
sessions/
  {sessionId}/

    phase: "lobby"            ← single string that drives what every screen shows
    creatorId: "p_abc123"     ← only the creator sees the "Continue" / advance button
    createdAt: 1749052800

    participants/
      {participantId}/
        name: "Guthrie"
        joinedAt: 1749052800

    responses/
      dineIn/
        {participantId}: "dine-in" | "delivery"
      distance/
        {participantId}: 3              ← number in miles
      price/
        {participantId}: "$" | "$$" | "$$$" | "$$$$"
      veto/
        {participantId}: ["italian", "fast-food"]     ← array of cuisine IDs
      dietary/
        {participantId}: ["shellfish"]                ← private, never displayed to others
      preferences/
        {participantId}: ["korean-bbq", "thai"]       ← hidden until phase = preferences-reveal

    swipeComplete/
      {participantId}: true | false

    swipeDecisions/
      {participantId}/
        {restaurantId}: "right" | "left"

    result/
      complete:   [ { id, name, cuisine, rating, distance } ]
      majority:   [ { id, name, cuisine, rating, distance } ]
      partial:    [ { id, name, cuisine, rating, distance } ]
```

### Participant IDs

There is no authentication. When a participant joins, generate a random ID (e.g. `p_` + 8 random alphanumeric characters) and save it to `localStorage` on their device. This ID persists across page refreshes and is used as the key for all their responses.

### Session ID format

6 characters, uppercase letters and numbers only, avoiding ambiguous characters (no 0, O, 1, I, L). Example: `MATCH7F`. Generate randomly on session creation.

---

## Complete phase list

```
lobby               Waiting for participants to join
dine-in             Voting: going out or staying in?
dine-in-reveal      Result shown — creator taps Continue to advance
distance            Voting: how far are you willing to go?
distance-reveal     Result shown — creator taps Continue
price               Voting: what kind of night is it? ($ to $$$$)
price-reveal        Result shown — creator taps Continue
veto                Cuisine veto grid — multi-select, group-visible
veto-reveal         Who vetoed what — creator taps Continue
dietary             Private dietary restrictions — no reveal
preferences         Private cuisine preference selection (up to 3)
preferences-reveal  Simultaneous reveal across all devices
swipe               Each participant swipes through restaurant cards independently
waiting             Shown to participants who finish before others
anticipation        Brief simultaneous beat — fires when last participant finishes swipe
summary             Full match hierarchy displayed
```

---

## Phase transition logic

### Voting steps (dine-in, distance, price, veto)

1. Participant submits their response → write to `responses/{step}/{participantId}`
2. Check: do all participants in `participants/` have a value at `responses/{step}`?
3. If yes → write `phase: "{step}-reveal"` to Firebase
4. If no → show completion state (name ✓ or name ...) and wait

### Dietary restrictions (no reveal)

1. Participant submits (or skips with empty array) → write to `responses/dietary/{participantId}`
2. Check: do all participants have a value?
3. If yes → write `phase: "preferences"` directly (no reveal phase)

### Preferences (simultaneous reveal)

1. Participant locks in selections → write to `responses/preferences/{participantId}`
2. Check: do all participants have a value?
3. If yes → write `phase: "preferences-reveal"`
4. All devices receive the phase change simultaneously and render the reveal at the same moment
5. Preferences remain hidden in the UI whenever `phase !== "preferences-reveal"`

### Swipe stack

1. Each participant swipes through all cards, writing decisions to `swipeDecisions/{participantId}/{restaurantId}`
2. When a participant finishes → write `swipeComplete/{participantId}: true`
3. If at least one participant is not yet complete → participants who ARE complete see `waiting` phase locally
4. When ALL participants are complete → the last to finish writes `phase: "anticipation"`
5. After a short delay (2–3 seconds) → write `phase: "summary"` and calculate results

### Phase advance (creator only)

After each reveal phase, only the creator sees a "Continue" button. Tapping it writes the next phase to Firebase. All devices transition together.

---

## Match calculation

Derive results from actual `swipeDecisions` data. Do not hardcode the winner.

- **Complete match:** every participant swiped right on the restaurant
- **Majority match:** more than half swiped right, but not all
- **Partial match:** at least one but not majority swiped right

Write the calculated result to `result/` in Firebase before transitioning to `summary` phase.

---

## Fake restaurant cards

Use exactly 10 hardcoded restaurant objects. They should represent a realistic spread of cuisine types, ratings, and distances. Format:

```javascript
const RESTAURANTS = [
  { id: "nobu",       name: "Nobu",          cuisine: "Japanese · Sushi",    rating: 4.3, distance: "1.2 mi" },
  { id: "kogi",       name: "Kogi BBQ",       cuisine: "Korean BBQ",          rating: 4.5, distance: "0.8 mi" },
  { id: "jitlada",   name: "Jitlada",         cuisine: "Thai",                rating: 4.6, distance: "2.1 mi" },
  { id: "republique", name: "Republique",     cuisine: "French · Californian",rating: 4.4, distance: "1.7 mi" },
  { id: "mariscos",  name: "Mariscos Jalisco",cuisine: "Mexican · Seafood",   rating: 4.7, distance: "3.0 mi" },
  { id: "otium",     name: "Otium",           cuisine: "American · Modern",   rating: 4.2, distance: "0.5 mi" },
  { id: "blu-jam",   name: "Blu Jam Cafe",    cuisine: "Cafe · Breakfast",    rating: 4.4, distance: "1.4 mi" },
  { id: "bestia",    name: "Bestia",          cuisine: "Italian",             rating: 4.6, distance: "2.3 mi" },
  { id: "howlin",    name: "Howlin' Ray's",   cuisine: "American · Chicken",  rating: 4.5, distance: "1.9 mi" },
  { id: "shunjuku",  name: "Shunjuku Ramen",  cuisine: "Japanese · Ramen",    rating: 4.3, distance: "1.1 mi" },
]
```

All participants see the same 10 cards in the same order.

---

## Cuisine categories (for veto and preference grids)

```javascript
const CUISINES = [
  { id: "japanese",    label: "Japanese"    },
  { id: "korean-bbq",  label: "Korean BBQ"  },
  { id: "thai",        label: "Thai"        },
  { id: "mexican",     label: "Mexican"     },
  { id: "italian",     label: "Italian"     },
  { id: "chinese",     label: "Chinese"     },
  { id: "indian",      label: "Indian"      },
  { id: "american",    label: "American"    },
  { id: "french",      label: "French"      },
  { id: "mediterranean", label: "Mediterranean" },
  { id: "fast-food",   label: "Fast food"   },
  { id: "pizza",       label: "Pizza"       },
]
```

**In the veto grid:** all 12 categories are shown. Multi-select, no cap. Show each participant's vetoes in real time as they're selected.

**In the preferences grid:** same 12 categories, but any category vetoed by anyone in the group is visually disabled (greyed out, not selectable). Cap at 3 selections per participant. Private — no live visibility.

---

## Dietary restriction options

```javascript
const DIETARY = [
  { id: "vegetarian",  label: "Vegetarian"   },
  { id: "vegan",       label: "Vegan"        },
  { id: "gluten-free", label: "Gluten-free"  },
  { id: "halal",       label: "Halal"        },
  { id: "kosher",      label: "Kosher"       },
  { id: "shellfish",   label: "Shellfish allergy" },
  { id: "nut-allergy", label: "Nut allergy"  },
  { id: "dairy-free",  label: "Dairy-free"   },
]
```

Private, never displayed to other participants, never revealed. Data is collected but has no effect on the stack in this prototype (stack is hardcoded). The screen exists to test the mechanic and feel.

---

## Screen reference

A detailed screen-by-screen flow with ASCII mockups showing the information at each moment is in `flow-walkthrough.md` in this project directory. Refer to it when building individual screens to understand what information should be present and what states each screen has.

The information architecture and full screen inventory is in `ia-and-flows.md`.

---

## First task

Do not start building yet. First:

1. Set up a new Next.js project with Tailwind CSS
2. Set up a Firebase project and connect it to the Next.js app (Realtime Database only — not Firestore, not Auth, not anything else)
3. Confirm the connection works by writing a test value to the database and reading it back on the page
4. Save this file as `CLAUDE.md` in the project root so it loads automatically in future sessions

Once those three things are confirmed working, the first feature to build is: session creation and join. A user opens the app, taps "Start a session," gets a 6-character code, and a second device can open the app, enter the code, and both devices see each other's names appear on screen in real time.

That one thing — working on two real phones — proves the Firebase real-time sync pattern is correct. Everything else builds on top of it.
