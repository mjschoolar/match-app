"use client";
// WaitingScreen — shown to participants who finish the swipe stack
// before everyone else is done.
//
// Deliberately minimal: communicates that something is still happening
// without surfacing who's done, how many cards are left, or any other
// detail that would undermine the simultaneous reveal.

export default function WaitingScreen() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-950 text-white">
      <div className="max-w-sm w-full text-center space-y-3">
        <h2 className="text-2xl font-semibold">Almost there.</h2>
        <p className="text-gray-400">The group is still going.</p>
      </div>
    </main>
  );
}
