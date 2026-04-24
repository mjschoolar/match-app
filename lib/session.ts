// lib/session.ts
// Helper functions for generating IDs and managing the participant identity
// stored in localStorage.

// No ambiguous characters: no 0 (looks like O), no 1 (looks like I or L),
// no O, no I, no L — per the spec in CLAUDE.md
const SESSION_ID_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateSessionId(): string {
  let id = "";
  for (let i = 0; i < 6; i++) {
    id += SESSION_ID_CHARS[Math.floor(Math.random() * SESSION_ID_CHARS.length)];
  }
  return id;
}

export function generateParticipantId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "p_";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// Returns the participant's ID from localStorage, creating one if this is
// their first visit. The ID persists across page refreshes.
export function getOrCreateParticipantId(): string {
  let id = localStorage.getItem("participantId");
  if (!id) {
    id = generateParticipantId();
    localStorage.setItem("participantId", id);
  }
  return id;
}
