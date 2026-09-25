// straight out of 05_score.R

export const haversineFt = (lat1, lng1, lat2, lng2) => {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6378137; // meters, same sphere distHaversine uses
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a)) * 3.28084;
};

export const scoreGuess = (distance, maxPoints, maxDist) => {
  let score = maxPoints * Math.exp(-10 * distance / maxDist);
  if (distance < 5280) score = score * 1.02;
  if (distance < 160) score = maxPoints;
  if (score > maxPoints) score = maxPoints;
  return Math.round(score);
};

export const distanceLabel = ft =>
  ft < 5280 ? `${Math.round(ft)} ft` : `${(ft / 5280).toFixed(1)} mi`;

// latest guess per team+round+location wins, same as 05_score.R
export const latestGuess = (guesses, teamIds, round, location) => {
  const ids = Array.isArray(teamIds) ? teamIds : [teamIds];
  return guesses
    .filter(g => ids.includes(g.team_id) && g.round === round && g.location === location)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
};

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
    } else {
      byKey.set(key, { name: t.name, ids: [t.id], size });
    }
  }
  return [...byKey.values()];
};

// Bigger teams have more brains, so hold them to a higher standard: pairs and
// solos play at par, every extra head past two shaves ~4% off the team's score.
const HANDICAP_PAR = 2;
const HANDICAP_PER_HEAD = 0.04;
export const sizeHandicap = (size) =>
  Math.max(0.5, 1 - HANDICAP_PER_HEAD * Math.max(0, (size || 1) - HANDICAP_PAR));

// score for one guess, with the team-size handicap folded in when it's turned on
export const scoreWithHandicap = (distance, maxPoints, maxDist, size, enabled = true) => {
  const base = scoreGuess(distance, maxPoints, maxDist);
  return enabled ? Math.round(base * sizeHandicap(size)) : base;
};

export const maxDistForCity = city => (city === 'NYC' ? 130000 : 73000);

// Stepping through one dot per team was fine for a handful of teams, but at
// a real full-room game (20 teams) it's ~100 taps to reveal a single round
// and the tooltips pile into an unreadable stack once guesses cluster. So
// everyone outside the closest few drops in at once as one "the field"
// step, then just the podium gets stepped one at a time for the suspense -
// same shape as the final standings animation already uses.
export const REVEAL_PODIUM_SIZE = 3;

// How many reveal steps one location needs: 1 bulk step for the field (only
// when there's actually a field beyond the podium) plus one step per podium
// spot, or just one step per team when the whole location IS the podium.
export const revealFrameCount = (n) => {
  if (n <= REVEAL_PODIUM_SIZE) return Math.max(1, n);
  return 1 + REVEAL_PODIUM_SIZE;
};
