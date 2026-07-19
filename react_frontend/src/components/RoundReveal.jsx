import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, CircleMarker, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../supabase';
import Standings from './Standings';
import { haversineFt, scoreGuess, distanceLabel, latestGuess, maxDistForCity, mergeTeams } from '../scoring';

const REVEAL_MS = 1100;   // per guess line
const LINGER_MS = 2000;   // pause on a finished location

// line colors, farthest guess first
const LINE_COLORS = ['#bf0d3e', '#ed8b00', '#FFD100', '#00B140', '#009cde', '#919d9d'];

function CameraDriver({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    if (points.length === 1) map.flyTo(points[0], 15, { duration: 1 });
    else map.flyToBounds(points, { padding: [50, 50], duration: 1, maxZoom: 16 });
  }, [map, JSON.stringify(points)]);
  return null;
}

export default function RoundReveal({ game, locations, isDC }) {
  const round = game?.current_round || 1;
  const totalRounds = game?.settings?.rounds ?? 3;
  const [data, setData] = useState(null);
  const [stage, setStage] = useState({ locIdx: 0, shown: 0, done: false });

  const roundLocations = locations.filter(l => l.round === round);

  useEffect(() => {
    if (!supabase || !game?.id) return;
    (async () => {
      const { data: teams } = await supabase.from('teams')
        .select('id,name').eq('game_id', game.id);
      if (!teams?.length) { setData({ teams: [], byLoc: {}, standings: [] }); return; }
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
            return { team: t.name, lat: g.lat, lng: g.lng, dist, score: scoreGuess(dist, maxPoints, maxDist) };
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
          const s = scoreGuess(haversineFt(loc.lat, loc.lng, g.lat, g.lng), maxPoints, maxDist);
          total += s;
          if (loc.round === round) roundScore += s;
        }
        return { name: t.name, roundScore, total };
      }).sort((a, b) => b.total - a.total);

      setData({ teams, byLoc, standings });
    })();
  }, [game?.id, round]);

  // the choreography clock
  useEffect(() => {
    if (!data || stage.done || !roundLocations.length) return;
    const cur = data.byLoc[roundLocations[stage.locIdx]?.seq] || [];
    let t;
    if (stage.shown < cur.length) {
      t = setTimeout(() => setStage(s => ({ ...s, shown: s.shown + 1 })), REVEAL_MS);
    } else if (stage.locIdx < roundLocations.length - 1) {
      t = setTimeout(() => setStage(s => ({ locIdx: s.locIdx + 1, shown: 0, done: false })), LINGER_MS);
    } else {
      t = setTimeout(() => setStage(s => ({ ...s, done: true })), LINGER_MS);
    }
    return () => clearTimeout(t);
  }, [data, stage, roundLocations.length]);

  if (!data) return <p>Getting the reveal ready...</p>;

  if (stage.done) {
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

  const loc = roundLocations[stage.locIdx];
  const cur = data.byLoc[loc.seq] || [];
  const revealed = cur.slice(0, stage.shown);
  // camera hugs the answer plus whatever hasn't been revealed yet, so it tightens as lines draw
  const cameraPoints = [
    [loc.lat, loc.lng],
    ...cur.slice(Math.max(0, stage.shown - 1)).map(g => [g.lat, g.lng]),
  ];
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
          <Marker position={[loc.lat, loc.lng]} />
          {revealed.map((g, i) => (
            <React.Fragment key={g.team}>
              <CircleMarker
                center={[g.lat, g.lng]}
                radius={8}
                pathOptions={{ color: LINE_COLORS[i % LINE_COLORS.length], fillOpacity: 0.9 }}
              />
              <Polyline
                positions={[[g.lat, g.lng], [loc.lat, loc.lng]]}
                pathOptions={{ color: LINE_COLORS[i % LINE_COLORS.length], weight: 3, dashArray: '8 6' }}
              />
            </React.Fragment>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
