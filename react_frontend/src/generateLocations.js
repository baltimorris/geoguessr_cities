import { loadMaps } from './components/StreetView';
import regions from './data/regions.json';

// Same picking logic as 02_locations.R, using the polygons and station lists
// that 08_export_regions.R pulls straight out of 01_borders.R.
// Run that script again if the polygons ever change.

const R_EARTH = 6378137;
const rad = d => (d * Math.PI) / 180;
const deg = r => (r * 180) / Math.PI;

// ring points are [lng, lat], same order as the R matrices
const inRing = (lng, lat, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const bboxOf = ring => ring.reduce((b, [lng, lat]) => ({
  minLng: Math.min(b.minLng, lng), maxLng: Math.max(b.maxLng, lng),
  minLat: Math.min(b.minLat, lat), maxLat: Math.max(b.maxLat, lat),
}), { minLng: 180, maxLng: -180, minLat: 90, maxLat: -90 });

const randomInRing = ring => {
  const b = bboxOf(ring);
  for (let i = 0; i < 200; i++) {
    const lng = b.minLng + Math.random() * (b.maxLng - b.minLng);
    const lat = b.minLat + Math.random() * (b.maxLat - b.minLat);
    if (inRing(lng, lat, ring)) return { lat, lng };
  }
  return null;
};

// geosphere::destPoint
const destPoint = (lat, lng, bearing, distM) => {
  const br = rad(bearing), la = rad(lat), lo = rad(lng), dr = distM / R_EARTH;
  const la2 = Math.asin(Math.sin(la) * Math.cos(dr) + Math.cos(la) * Math.sin(dr) * Math.cos(br));
  const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(la),
                              Math.cos(dr) - Math.sin(la) * Math.sin(la2));
  return { lat: deg(la2), lng: deg(lo2) };
};

// the square around a station, exactly the four bearings 02_locations.R uses
const stationRing = (station, distanceFt) => {
  const m = distanceFt * 0.3048;
  return [315, 45, 135, 225].map(b => {
    const p = destPoint(station.lat, station.lng, b, m);
    return [p.lng, p.lat];
  });
};

const metersBetween = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
};

// admin weights -> buckets, skipping any that can't be used
const bucketsFor = (city, settings) => {
  const reg = regions[city] || regions.DC;
  const w = (city === 'NYC' ? settings?.nyc : settings?.dc) || {};
  const out = [];
  const add = (name, weight, ring) => {
    if (weight > 0 && ring) out.push({ name, weight, ring });
  };
  if (city === 'NYC') {
    add('Manhattan', w.manhattan ?? 43, reg.polygons.manhattan);
    add('Brooklyn', w.brooklyn ?? 32, reg.polygons.brooklyn);
    add('Queens', w.queens ?? 12, reg.polygons.queens);
    add('Bronx', w.bronx ?? 3, reg.polygons.bronx);
    if ((w.subway ?? 10) > 0 && reg.stations.length) {
      out.push({ name: 'Subway', weight: w.subway ?? 10, stations: reg.stations, distanceFt: w.subway_distance ?? 100 });
    }
  } else {
    add('At Large', w.at_large ?? 50, reg.polygons.at_large);
    add('Downtown', w.downtown ?? 15, reg.polygons.downtown);
    add('Greater Central', w.greater_central ?? 25, reg.polygons.greater_central);
    if ((w.metro ?? 10) > 0 && reg.stations.length) {
      out.push({ name: 'Metro', weight: w.metro ?? 10, stations: reg.stations, distanceFt: w.metro_distance ?? 150 });
    }
  }
  return out;
};

const pickBucket = buckets => {
  const total = buckets.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * total;
  for (const b of buckets) {
    r -= b.weight;
    if (r <= 0) return b;
  }
  return buckets[buckets.length - 1];
};

const draftPoint = bucket => {
  if (bucket.stations) {
    const st = bucket.stations[Math.floor(Math.random() * bucket.stations.length)];
    return randomInRing(stationRing(st, bucket.distanceFt));
  }
  return randomInRing(bucket.ring);
};

// Snap to a real outdoor panorama, same job 03_metadata.R does
const nearestPano = (svc, google, point) =>
  new Promise(resolve => {
    svc.getPanorama(
      { location: point, radius: 60, source: google.maps.StreetViewSource.OUTDOOR },
      (data, status) => {
        if (status === google.maps.StreetViewStatus.OK && data?.location?.latLng) {
          resolve({ lat: data.location.latLng.lat(), lng: data.location.latLng.lng() });
        } else {
          resolve(null);
        }
      }
    );
  });

export async function generateLocations({ apiKey, city, rounds, perRound, settings }) {
  if (!apiKey) throw new Error('needs a google maps key');
  const google = await loadMaps(apiKey);
  const svc = new google.maps.StreetViewService();
  const buckets = bucketsFor(city, settings);
  if (!buckets.length) throw new Error('no areas to pick from, check the weights');

  const minGap = regions.minSpacingMeters ?? 314;
  const chosen = [];
  const out = [];

  for (let round = 1; round <= rounds; round++) {
    for (let seq = 1; seq <= perRound; seq++) {
      let spot = null;
      let area = null;
      for (let tries = 0; tries < 40 && !spot; tries++) {
        const bucket = pickBucket(buckets);
        const draft = draftPoint(bucket);
        if (!draft) continue;
        const pano = await nearestPano(svc, google, draft);
        // keep them spread out, same 314m rule as 02_locations.R
        if (pano && chosen.every(c => metersBetween(c, pano) >= minGap)) {
          spot = pano;
          area = bucket.name;
        }
      }
      if (spot) {
        chosen.push(spot);
        out.push({ round, seq, lat: spot.lat, lng: spot.lng, area });
      }
    }
  }
  return out;
}
