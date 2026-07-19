import { loadMaps } from './components/StreetView';

// Rough boxes for each city, same idea as the borders in 01_borders.R but without the shapefiles.
// The R pipeline is still the good way to pick locations, this is just for testing a game quickly.
const BOX = {
  DC: { minLat: 38.808, maxLat: 38.985, minLng: -77.105, maxLng: -76.925 },
  NYC: { minLat: 40.580, maxLat: 40.870, minLng: -74.020, maxLng: -73.760 },
};

// The DC diamond, so we stop dropping people in Maryland
const DC_DIAMOND = [
  [38.9955, -77.0410], [38.8934, -76.9094], [38.7916, -77.0398], [38.8934, -77.1198],
];

const inPolygon = ({ lat, lng }, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const randomIn = (box, city) => {
  for (let i = 0; i < 60; i++) {
    const p = {
      lat: box.minLat + Math.random() * (box.maxLat - box.minLat),
      lng: box.minLng + Math.random() * (box.maxLng - box.minLng),
    };
    if (city !== 'DC' || inPolygon(p, DC_DIAMOND)) return p;
  }
  return { lat: (box.minLat + box.maxLat) / 2, lng: (box.minLng + box.maxLng) / 2 };
};

// Snap a random point to the nearest outdoor panorama. Metadata lookups like this
// are free, and it keeps us from dropping people in the middle of the Potomac.
const nearestPano = (svc, google, point) =>
  new Promise(resolve => {
    svc.getPanorama(
      // keep the radius tight, a wide one hops the river into Virginia
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

export async function generateLocations({ apiKey, city, rounds, perRound }) {
  if (!apiKey) throw new Error('needs a google maps key');
  const google = await loadMaps(apiKey);
  const svc = new google.maps.StreetViewService();
  const box = BOX[city] || BOX.DC;

  const out = [];
  for (let round = 1; round <= rounds; round++) {
    for (let seq = 1; seq <= perRound; seq++) {
      let spot = null;
      // a few swings before giving up on this slot
      for (let tries = 0; tries < 12 && !spot; tries++) {
        spot = await nearestPano(svc, google, randomIn(box, city));
      }
      if (spot) out.push({ round, seq, lat: spot.lat, lng: spot.lng });
    }
  }
  return out;
}
