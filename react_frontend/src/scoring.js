// scoring (distance, handicap, points) lives in the db now - see the
// haversine_ft/score_guess/size_handicap/score_with_handicap functions and
// the guess_scores/team_round_scores/team_total_scores views. what's left
// here is purely client-side presentation/pacing, nothing that computes a score.

export const distanceLabel = ft =>
  ft < 5280 ? `${Math.round(ft)} ft` : `${(ft / 5280).toFixed(1)} mi`;

// "Beb" and "beb" are one team, fold any duplicate rows together
export const mergeTeams = (teams) => {
  const byKey = new Map();
  for (const t of teams) {
    const key = (t.name || '').trim().toLowerCase();
    const size = t.size || 1;
    if (byKey.has(key)) {
      const m = byKey.get(key);
      m.ids.push(t.id);
      m.size = Math.max(m.size, size);
      if (!m.emoji && t.emoji) m.emoji = t.emoji;
    } else {
      byKey.set(key, { name: t.name, ids: [t.id], size, emoji: t.emoji });
    }
  }
  return [...byKey.values()];
};

// Stepping through one dot per team was fine for a handful of teams, but at
// a real full-room game (20 teams) it's ~100 taps to reveal a single round
// and the tooltips pile into an unreadable stack once guesses cluster. So
// everyone outside the closest few drops in at once as one "the field"
// step, then just the podium gets stepped one at a time for the suspense.
// This only governs the per-location map reveal - the final scorecard's
// medal styling and the game-winner countdown are their own fixed top 3,
// independent of this.
export const REVEAL_PODIUM_SIZE = 5;

// How many reveal steps one location needs: 1 bulk step for the field (only
// when there's actually a field beyond the podium) plus one step per podium
// spot, or just one step per team when the whole location IS the podium.
export const revealFrameCount = (n) => {
  if (n <= REVEAL_PODIUM_SIZE) return Math.max(1, n);
  return 1 + REVEAL_PODIUM_SIZE;
};
