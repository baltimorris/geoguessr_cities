import React, { useState, useEffect } from 'react';
import { MapContainer, Marker, CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ThemedTiles from './ThemedTiles';
import { supabase } from '../supabase';
import Standings from './Standings';
import { haversineFt, scoreWithHandicap, distanceLabel, latestGuess, maxDistForCity, mergeTeams } from '../scoring';

// line colors, farthest guess first
const LINE_COLORS = ['#bf0d3e', '#ed8b00', '#009cde', '#00B140', '#8e44ad', '#919d9d'];

// bullseye divIcon for the true location
const answerIcon = L.divIcon({
  className: 'answer-icon',
  html: '<div class="answer-ring"></div><div class="answer-dot"></div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

// Camera only moves when its points change, i.e. when the admin steps.
// On the closest reveal it dives in tight even if the rest fall off-screen.
function CameraDriver({ points, tight }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    if (points.length === 1) {
      map.flyTo(points[0], 15, { duration: 0.9 });
    } else {
      map.flyToBounds(points, {
        padding: tight ? [80, 80] : [55, 55],
        maxZoom: tight ? 17 : 15,
        duration: tight ? 0.7 : 1.1,
        easeLinearity: 0.25,
      });
    }
  }, [map, JSON.stringify(points), tight]);
  return null;
}

// Bumps a tick on every map move so the edge arrows recompute in sync
function MapBus({ onMap, onMove }) {
  const map = useMap();
  useEffect(() => { onMap(map); }, [map, onMap]);
  useMapEvents({ move: onMove, zoom: onMove, resize: onMove });
  return null;
}

// arrows at the map edge for revealed teams that scrolled off-screen. the arrow
// sits at the team's ACTUAL projected position clamped to the edge, so it lines up
// with their true latitude (off left/right) or longitude (off top/bottom).
function EdgeArrows({ map, points }) {
  if (!map) return null;
  const size = map.getSize();
  const margin = 30;
  return points.map((p, i) => {
    const pt = map.latLngToContainerPoint([p.lat, p.lng]);
    const inView = pt.x >= 0 && pt.x <= size.x && pt.y >= 0 && pt.y <= size.y;
    if (inView) return null;
    const ex = Math.max(margin, Math.min(size.x - margin, pt.x));
    const ey = Math.max(margin, Math.min(size.y - margin, pt.y));
    const angle = (Math.atan2(pt.y - ey, pt.x - ex) * 180) / Math.PI;
    const color = LINE_COLORS[i % LINE_COLORS.length];
    // keep the label on the interior side so it doesn't run off the map
    const dir = ex > size.x / 2 ? 'row-reverse' : 'row';
    return (
      <div key={p.team} className="edge-arrow" style={{ left: ex, top: ey, flexDirection: dir }}>
        <span className="edge-arrow-head" style={{ transform: `rotate(${angle}deg)`, color }}>➤</span>
        <span className="edge-arrow-label" style={{ borderColor: color }}>
          {p.team} · {distanceLabel(p.dist)}
        </span>
      </div>
    );
  });
}

export default function RoundReveal({ game, locations, isDC }) {
  const round = game?.current_round || 1;
  const totalRounds = game?.settings?.rounds ?? 3;
  const step = game?.reveal_step || 0; // admin-driven, shared over realtime
  const [data, setData] = useState(null);
  const [map, setMap] = useState(null);
  const [, setTick] = useState(0);

  const roundLocations = locations
    .filter(l => l.round === round)
    .sort((a, b) => a.seq - b.seq);

  useEffect(() => {
    if (!supabase || !game?.id) return;
    (async () => {
      const { data: teams } = await supabase.from('teams')
        .select('id,name,size').eq('game_id', game.id);
      if (!teams?.length) { setData({ byLoc: {}, standings: [] }); return; }
      const { data: guesses } = await supabase.from('guesses')
        .select('*').in('team_id', teams.map(t => t.id));

      const maxPoints = game.settings?.maxPoints || 5000;
      const maxDist = maxDistForCity(game.city);
      const merged = mergeTeams(teams);

      const byLoc = {};
      for (const loc of roundLocations) {
        byLoc[loc.seq] = merged
          .map(t => {
            const g = latestGuess(guesses || [], t.ids, round, loc.seq);
            if (!g) return null;
            const dist = haversineFt(loc.lat, loc.lng, g.lat, g.lng);
            return { team: t.name, lat: g.lat, lng: g.lng, dist, score: scoreWithHandicap(dist, maxPoints, maxDist, t.size) };
          })
          .filter(Boolean)
          .sort((a, b) => b.dist - a.dist);
      }

      const playedLocs = locations.filter(l => l.round <= round);
      const standings = merged.map(t => {
        let total = 0, roundScore = 0;
        for (const loc of playedLocs) {
          const g = latestGuess(guesses || [], t.ids, loc.round, loc.seq);
          if (!g) continue;
          const s = scoreWithHandicap(haversineFt(loc.lat, loc.lng, g.lat, g.lng), maxPoints, maxDist, t.size);
          total += s;
          if (loc.round === round) roundScore += s;
        }
        return { name: t.name, roundScore, total, size: t.size };
      }).sort((a, b) => b.total - a.total);

      setData({ byLoc, standings });
    })();
  }, [game?.id, round]);

  if (!data) return <p>Getting the reveal ready...</p>;

  const frames = [];
  roundLocations.forEach((loc, li) => {
    const n = (data.byLoc[loc.seq] || []).length;
    for (let k = 1; k <= Math.max(1, n); k++) frames.push({ li, shown: Math.min(k, n) });
  });

  if (!frames.length || step >= frames.length) {
    return (
      <div className="results">
        <h2>Round {round} standings</h2>
        <Standings
          rows={data.standings}
          renderScore={r => `+${r.roundScore.toLocaleString()} → ${r.total.toLocaleString()}`}
        />
        <p className="team-hint">
          {round < totalRounds
            ? 'Hang tight, the next round starts soon'
            : 'That was the last round, final scores coming up'}
        </p>
      </div>
    );
  }

  const { li, shown } = frames[step];
  const loc = roundLocations[li];
  const cur = data.byLoc[loc.seq] || [];
  const revealed = cur.slice(0, shown);
  const lastRevealed = revealed[revealed.length - 1];
  const isClosest = shown === cur.length && cur.length > 0; // final guess for this spot

  // tight on answer+closest for the finale, otherwise frame everything shown
  const cameraPoints = isClosest
    ? [[loc.lat, loc.lng], [revealed[revealed.length - 1].lat, revealed[revealed.length - 1].lng]]
    : [[loc.lat, loc.lng], ...revealed.map(g => [g.lat, g.lng])];

  return (
    <div className="reveal">
      <p className="round-progress">
        Round {round} reveal &mdash; location {loc.seq}
        {lastRevealed && ` · ${lastRevealed.team}: ${distanceLabel(lastRevealed.dist)}`}
      </p>
      <div className="map-container reveal-map">
        <MapContainer
          center={isDC ? [38.9072, -77.0369] : [40.7128, -74.0060]}
          zoom={12}
          zoomSnap={0}
          zoomControl={false}
          style={{ height: '100%', width: '100%' }}
        >
          <ThemedTiles />
          <MapBus onMap={setMap} onMove={() => setTick(t => t + 1)} />
          <CameraDriver points={cameraPoints} tight={isClosest} />
          <Marker position={[loc.lat, loc.lng]} icon={answerIcon}>
            <Tooltip permanent direction="top" offset={[0, -16]} className="reveal-tt tt-answer">
              Location {loc.seq}
            </Tooltip>
          </Marker>
          {revealed.map((g, i) => {
            const color = LINE_COLORS[i % LINE_COLORS.length];
            const rank = cur.length - i; // farthest-first, closest gets rank 1
            return (
              <React.Fragment key={g.team}>
                <CircleMarker
                  center={[g.lat, g.lng]}
                  radius={9}
                  pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 1, className: 'reveal-dot' }}
                >
                  <Tooltip permanent direction="auto" offset={[10, 0]} className={`reveal-tt tt-${i}`}>
                    <b>{rank}.</b> {g.team} · {distanceLabel(g.dist)}
                  </Tooltip>
                </CircleMarker>
                <Polyline
                  positions={[[loc.lat, loc.lng], [g.lat, g.lng]]}
                  pathOptions={{ color, weight: 3, className: 'reveal-line' }}
                />
              </React.Fragment>
            );
          })}
        </MapContainer>
        <EdgeArrows map={map} points={revealed} />
      </div>
      <p className="team-hint">The game runner is walking through the reveal</p>
    </div>
  );
}
