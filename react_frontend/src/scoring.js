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
export const latestGuess = (guesses, teamId, round, location) =>
  guesses
    .filter(g => g.team_id === teamId && g.round === round && g.location === location)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

export const maxDistForCity = city => (city === 'NYC' ? 130000 : 73000);
