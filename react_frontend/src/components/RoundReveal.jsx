import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../supabase';
import Standings from './Standings';
import { haversineFt, scoreWithHandicap, distanceLabel, latestGuess, maxDistForCity, mergeTeams } from '../scoring';

// line colors, farthest guess first
const LINE_COLORS = ['#bf0d3e', '#ed8b00', '#FFD100', '#00B140', '#009cde', '#919d9d'];

// Only pans/zooms when the points change, and points only change when the admin steps
function CameraDriver({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    if (points.length === 1) map.flyTo(points[0], 15, { duration: 1 });
    else map.flyToBounds(points, { padding: [60, 60], duration: 1, maxZoom: 16 });
  }, [map, JSON.stringify(points)]);
  return null;
}

export default function RoundReveal({ game, locations, isDC }) {
  const round = game?.current_round || 1;
  const totalRounds = game?.settings?.rounds ?? 3;
  const step = game?.reveal_step || 0; // admin-driven, shared over realtime
  const [data, setData] = useState(null);

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

      // per location of this round: each team's latest guess, farthest first
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

      // cumulative standings through this round
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

  // Flatten to frames: one per revealed guess, farthest to closest, location by location.
  // A location with no guesses still gets one frame so the answer pin can show.
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
  // camera hugs the answer plus what's revealed, tightening as the admin steps closer
  const cameraPoints = [[loc.lat, loc.lng], ...revealed.map(g => [g.lat, g.lng])];
  const lastRevealed = revealed[revealed.length - 1];

  return (
    <div className="reveal">
      <p className="round-progress">
        Round {round} reveal &mdash; location {loc.seq}
        {lastRevealed && ` · ${lastRevealed.team}: ${distanceLabel(lastRevealed.dist)}`}
      </p>
      <div className="map-container">
        <MapContainer
          center={isDC ? [38.9072, -77.0369] : [40.7128, -74.0060]}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <CameraDriver points={cameraPoints} />
          <Marker position={[loc.lat, loc.lng]}>
            <Tooltip permanent direction="top" offset={[0, -34]}>Location {loc.seq}</Tooltip>
          </Marker>
          {revealed.map((g, i) => {
            const color = LINE_COLORS[i % LINE_COLORS.length];
            const rank = cur.length - i; // farthest-first, so closest gets rank 1
            return (
              <React.Fragment key={g.team}>
                <CircleMarker
                  center={[g.lat, g.lng]}
                  radius={9}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.9, className: 'reveal-dot' }}
                >
                  <Tooltip permanent direction="right" offset={[8, 0]}>
                    {rank}. {g.team} · {distanceLabel(g.dist)}
                  </Tooltip>
                </CircleMarker>
                <Polyline
                  positions={[[g.lat, g.lng], [loc.lat, loc.lng]]}
                  pathOptions={{ color, weight: 3, dashArray: '8 6', className: 'reveal-line' }}
                />
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>
      <p className="team-hint">The game runner is walking through the reveal</p>
    </div>
  );
}
