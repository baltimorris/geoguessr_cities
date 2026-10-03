import React, { useMemo, useState } from 'react';
import { MapContainer, Marker, Polygon } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ThemedTiles from './ThemedTiles';
import StreetThumb from './StreetThumb';
import Btn from './Btn';
import { supabase } from '../supabase';
import { generateOneLocation } from '../generateLocations';
import { flagLocations, cityRings, locKey } from '../locationQC';

const ROUND_COLORS = ['#009cde', '#ed8b00', '#8e44ad', '#00B140', '#919d9d'];

const pinIcon = (l, flagged, selected) => L.divIcon({
  className: 'qc-pin-wrap',
  html: `<div class="qc-pin ${flagged ? 'qc-pin-flag' : ''} ${selected ? 'qc-pin-sel' : ''}" style="background:${ROUND_COLORS[(l.round - 1) % ROUND_COLORS.length]}">${l.seq}</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

// The runner's last look at a game's spots before players ever see them:
// every spot on a map (with the city outline, so a stray VA/MD one is
// obvious) plus a picture of each, with warnings on anything outside the
// city or crowding another spot. Any spot can be swapped for a fresh pick,
// as long as that round hasn't been played yet.
export default function AdminLocationQC({ game, locations, setLocations, onClose }) {
  const isDC = (game.city || 'DC') === 'DC';
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const [selected, setSelected] = useState(null);
  const [swapping, setSwapping] = useState(null);
  const [error, setError] = useState('');

  const real = useMemo(
    () => locations.filter(l => l.round >= 1).sort((a, b) => a.round - b.round || a.seq - b.seq),
    [locations]
  );
  const flags = useMemo(() => flagLocations(real, game.city || 'DC'), [real, game.city]);
  const flaggedCount = [...flags.values()].filter(f => f.length).length;
  const rings = useMemo(() => cityRings(game.city || 'DC'), [game.city]);
  const rounds = [...new Set(real.map(l => l.round))];

  const locked = l => game.status !== 'lobby' && l.round <= (game.current_round ?? 1);

  const swap = async l => {
    setError('');
    setSwapping(l.id);
    try {
      const avoid = real.filter(x => x.id !== l.id);
      const next = await generateOneLocation({ apiKey, city: game.city, settings: game.settings, avoid });
      if (!next) throw new Error('Couldn\'t find a better spot, try again');
      const { error: upErr } = await supabase.from('locations')
        .update({ lat: next.lat, lng: next.lng, heading: null }).eq('id', l.id);
      if (upErr) throw upErr;
      setLocations(prev => prev.map(x => (x.id === l.id ? { ...x, lat: next.lat, lng: next.lng, heading: null } : x)));
    } catch (e) {
      setError(e.message || 'Couldn\'t swap that one, try again');
    }
    setSwapping(null);
  };

  const pick = l => {
    setSelected(locKey(l));
    document.getElementById(`qc-card-${locKey(l)}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const bounds = real.length ? L.latLngBounds(real.map(l => [l.lat, l.lng])).pad(0.15) : null;

  return (
    <div className="qc-view">
      <div className="admin-map-bar">
        <span className="admin-map-code">{game.code}</span>
        <div className="admin-map-bar-actions">
          <button className="leave-link" onClick={onClose}>done</button>
        </div>
      </div>

      <div className="qc-body">
        <h2>Review locations</h2>
        <p className={flaggedCount ? 'pw-error' : 'team-hint'}>
          {real.length} spots · {flaggedCount
            ? `${flaggedCount} flagged - check the red ones`
            : 'nothing flagged. still glance at the pictures for indoor spots'}
        </p>

        <div className="qc-map">
          <MapContainer
            center={isDC ? [38.9072, -77.0369] : [40.7128, -74.0060]}
            zoom={11}
            zoomSnap={0}
            bounds={bounds || undefined}
            style={{ height: '100%', width: '100%' }}
          >
            <ThemedTiles />
            {rings.map((ring, i) => (
              <Polygon key={i} positions={ring} pathOptions={{ color: '#888', weight: 1.5, dashArray: '4 4', fillOpacity: 0.04 }} />
            ))}
            {real.map(l => (
              <Marker
                key={`${locKey(l)}-${l.lat}`}
                position={[l.lat, l.lng]}
                icon={pinIcon(l, flags.get(locKey(l))?.length > 0, selected === locKey(l))}
                eventHandlers={{ click: () => pick(l) }}
              />
            ))}
          </MapContainer>
        </div>

        <div className="qc-legend">
          {rounds.map(r => (
            <span key={r}><i style={{ background: ROUND_COLORS[(r - 1) % ROUND_COLORS.length] }} /> Round {r}</span>
          ))}
          <span><i className="qc-legend-flag" /> flagged</span>
        </div>

        {error && <p className="pw-error">{error}</p>}

        {rounds.map(r => (
          <section key={r} className="qc-round">
            <h3>Round {r}</h3>
            <div className="qc-grid">
              {real.filter(l => l.round === r).map(l => {
                const f = flags.get(locKey(l)) || [];
                return (
                  <div
                    key={l.id || locKey(l)}
                    id={`qc-card-${locKey(l)}`}
                    className={`qc-card ${f.length ? 'qc-card-flag' : ''} ${selected === locKey(l) ? 'qc-card-sel' : ''}`}
                    onClick={() => setSelected(locKey(l))}
                  >
                    <StreetThumb key={`${l.lat},${l.lng}`} lat={l.lat} lng={l.lng} heading={l.heading} isDC={isDC}
                      label={`Round ${l.round} · #${l.seq}`} />
                    <div className="qc-card-row">
                      <b>#{l.seq}</b>
                      <Btn
                        variant="outline"
                        disabled={locked(l) || swapping !== null}
                        onClick={() => swap(l)}
                      >
                        {swapping === l.id ? 'Swapping…' : locked(l) ? 'Played' : 'Swap'}
                      </Btn>
                    </div>
                    {f.map((t, i) => <p key={i} className="qc-flag-text">⚠ {t}</p>)}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
