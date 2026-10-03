import regions from './data/regions.json';
import { isInsideCity, metersBetween } from './generateLocations';

// closer than this and two spots in one game feel like the same place. the
// generator itself only guarantees 314m, so this is a notch above that.
export const TOO_CLOSE_M = 500;

export const locKey = l => `${l.round}-${l.seq}`;

// What the runner should look at twice before the game goes out: spots that
// ended up outside the city (VA/MD from a Metro stop near the line) and
// spots sitting almost on top of each other. Indoor panos can't be caught
// here, that's what the thumbnails are for. Practice spots (round 0) are
// hard coded and not reviewed.
export function flagLocations(locations, city) {
  const real = locations.filter(l => l.round >= 1);
  const flags = new Map(real.map(l => [locKey(l), []]));
  for (const l of real) {
    if (!isInsideCity(city, l)) flags.get(locKey(l)).push('Looks like it\'s outside the city');
  }
  for (let i = 0; i < real.length; i++) {
    for (let j = i + 1; j < real.length; j++) {
      const m = metersBetween(real[i], real[j]);
      if (m < TOO_CLOSE_M) {
        const a = real[i], b = real[j];
        flags.get(locKey(a)).push(`${Math.round(m)} m from R${b.round} #${b.seq}`);
        flags.get(locKey(b)).push(`${Math.round(m)} m from R${a.round} #${a.seq}`);
      }
    }
  }
  return flags;
}

// the city outline(s), for drawing on the QC map: [lat, lng] rings
export const cityRings = city =>
  Object.values((regions[city] || regions.DC).polygons).map(ring => ring.map(([lng, lat]) => [lat, lng]));
