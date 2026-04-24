// lib/types.ts
// Shared TypeScript types that match the data model in CLAUDE.md.
// These keep our code safe — TypeScript will warn us if we try to use
// a field that doesn't exist on a session object.

export interface Participant {
  name: string;
  joinedAt: number;
}

export interface RestaurantResult {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  distance: string;
}

export interface Session {
  phase: string;
  creatorId: string;
  createdAt: number;
  participants: Record<string, Participant>;
  responses?: {
    dineIn?: Record<string, string>;
    distance?: Record<string, number>;
    price?: Record<string, string>;
    veto?: Record<string, string[]>;
    dietary?: Record<string, string[]>;
    preferences?: Record<string, string[]>;
  };
  swipeComplete?: Record<string, boolean>;
  swipeDecisions?: Record<string, Record<string, string>>;
  result?: {
    complete: RestaurantResult[];
    majority: RestaurantResult[];
    partial: RestaurantResult[];
  };
}
