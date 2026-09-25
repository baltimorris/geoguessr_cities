import React, { useState, useEffect } from 'react';
import { MapContainer, Marker, CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ThemedTiles from './ThemedTiles';
import { supabase } from '../supabase';
import Standings from './Standings';
import { haversineFt, scoreWithHandicap, distanceLabel, latestGuess, maxDistForCity, mergeTeams, REVEAL_PODIUM_SIZE } from '../scoring';

// line colors, farthest guess first
const LINE_COLORS = ['#bf0d3e', '#ed8b00', '#009cde', '#00B140', '#8e44ad', '#919d9d'];
const FIELD_COLOR = '#888'; // muted gray for the bulk "everyone else" group

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

// Leaflet's projection can throw right as the map first mounts or mid-flyTo,
// before its panes are actually positioned - never let a transient read like
// that crash the whole reveal.
function safeContainerPoint(map, lat, lng) {
  try { return map.latLngToContainerPoint([lat, lng]); } catch { return null; }
}

// arrows at the map edge for revealed teams that scrolled off-screen. the arrow
// sits at the team's ACTUAL projected position clamped to the edge, so it lines up
// with their true latitude (off left/right) or longitude (off top/bottom). each
// point carries its own color so it matches whatever's drawn for it on the map.
function EdgeArrows({ map, points }) {
  if (!map) return null;
  let size;
  try { size = map.getSize(); } catch { return null; }
  const margin = 30;
  return points.map((p) => {
    const pt = safeContainerPoint(map, p.lat, p.lng);
    if (!pt) return null;
    const inView = pt.x >= 0 && pt.x <= size.x && pt.y >= 0 && pt.y <= size.y;
    if (inView) return null;
    const ex = Math.max(margin, Math.min(size.x - margin, pt.x));
    const ey = Math.max(margin, Math.min(size.y - margin, pt.y));
    const angle = (Math.atan2(pt.y - ey, pt.x - ex) * 180) / Math.PI;
    // keep the label on the interior side so it doesn't run off the map
    const dir = ex > size.x / 2 ? 'row-reverse' : 'row';
    return (
      <div key={p.team} className="edge-arrow" style={{ left: ex, top: ey, flexDirection: dir }}>
        <span className="edge-arrow-head" style={{ transform: `rotate(${angle}deg)`, color: p.color }}>➤</span>
        <span className="edge-arrow-label" style={{ borderColor: p.color }}>
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
  const [bulkShown, setBulkShown] = useState(0);

  const roundLocations = locations
    .filter(l => l.round === round)
    .sort((a, b) => a.seq - b.seq);

  useEffect(() => {
    if (!supabase || !game?.id) return;
    // locations arrive as a separate async fetch up in App.jsx - on a refresh
    // mid-reveal this effect can run before that's landed, computing everyone
    // at 0 points off an empty round. Wait for a real fetch instead of
    // flashing that, then let this same effect's `locations` dependency
    // rerun it once locations actually show up.
    if (!locations.length) return;
    (async () => {
      const { data: teams } = await supabase.from('teams')
        .select('id,name,size').eq('game_id', game.id);
      if (!teams?.length) { setData({ byLoc: {}, standings: [] }); return; }
      const { data: guesses } = await supabase.from('guesses')
        .select('*').in('team_id', teams.map(t => t.id));

      const maxPoints = game.settings?.maxPoints || 5000;
      const maxDist = maxDistForCity(game.city);
      const handicap = game.settings?.handicap !== false;
      const cap = game.settings?.maxTeamSize || Infinity;
      const merged = mergeTeams(teams);
      const sizeOf = t => Math.min(t.size, cap);

      const byLoc = {};
      for (const loc of roundLocations) {
        byLoc[loc.seq] = merged
          .map(t => {
            const g = latestGuess(guesses || [], t.ids, round, loc.seq);
            if (!g) return null;
            const dist = haversineFt(loc.lat, loc.lng, g.lat, g.lng);
            return { team: t.name, lat: g.lat, lng: g.lng, dist, score: scoreWithHandicap(dist, maxPoints, maxDist, sizeOf(t), handicap) };
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
          const s = scoreWithHandicap(haversineFt(loc.lat, loc.lng, g.lat, g.lng), maxPoints, maxDist, sizeOf(t), handicap);
          total += s;
          if (loc.round === round) roundScore += s;
        }
        return { name: t.name, roundScore, total, size: sizeOf(t) };
      }).sort((a, b) => b.total - a.total);

      setData({ byLoc, standings });
    })();
  }, [game?.id, round, locations]);

  // Small fields step one dot at a time like always. Once a location has more
  // guesses than fit on the podium, everyone outside it drops in as a single
  // bulk step (no tooltip pileup, no dozens of taps), then just the podium
  // gets stepped individually for the suspense - farthest of the podium
  // first, winner last. Computed unconditionally (data may still be null) so
  // the hooks below can depend on it without breaking the rules of hooks.
  const frames = [];
  if (data) {
    roundLocations.forEach((loc, li) => {
      const n = (data.byLoc[loc.seq] || []).length;
      if (n <= REVEAL_PODIUM_SIZE) {
        for (let k = 1; k <= Math.max(1, n); k++) frames.push({ li, shown: Math.min(k, n), bulk: false });
      } else {
        const bulkCount = n - REVEAL_PODIUM_SIZE;
        frames.push({ li, shown: bulkCount, bulk: true });
        for (let k = 1; k <= REVEAL_PODIUM_SIZE; k++) frames.push({ li, shown: bulkCount + k, bulk: false });
      }
    });
  }
  const frame = step < frames.length ? frames[step] : null;
  const loc = frame ? roundLocations[frame.li] : null;
  const cur = frame ? (data.byLoc[loc.seq] || []) : [];
  const bulkCount = cur.length > REVEAL_PODIUM_SIZE ? cur.length - REVEAL_PODIUM_SIZE : 0;
  const bulk = frame?.bulk || false;

  // Pop the field in one at a time instead of dumping the whole group in at
  // once - resets every time we land on a (new) bulk step.
  useEffect(() => {
    if (!bulk) return;
    setBulkShown(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setBulkShown(i);
      if (i >= bulkCount) clearInterval(id);
    }, 90);
    return () => clearInterval(id);
  }, [step, bulk, bulkCount]);

  if (!data) return <p>Getting the reveal ready...</p>;

  if (!frame) {
    // Last round's own "standings" screen used to show cumulative totals,
    // then Finish game swapped in a Results screen showing the exact same
    // numbers a second later - jarring and redundant. So once the final
    // round's reveal is done, just show it as the final scores already;
    // Finish game becomes a no-visible-change formality after that.
    const isFinalRound = round >= totalRounds;
    return (
      <div className="results">
        <h2>{isFinalRound ? 'Final scores' : `Round ${round} standings`}</h2>
        <Standings
          rows={data.standings}
          renderScore={r => isFinalRound
            ? r.total.toLocaleString()
            : `+${r.roundScore.toLocaleString()} → ${r.total.toLocaleString()}`}
        />
        {!isFinalRound && <p className="team-hint">Hang tight, the next round starts soon</p>}
      </div>
    );
  }

  const { shown } = frame;
  const revealed = cur.slice(0, shown);
  const bulkVisible = bulk ? Math.min(bulkShown, bulkCount) : bulkCount;
  const lastRevealed = bulk ? null : revealed[revealed.length - 1];
  const isClosest = shown === cur.length && cur.length > 0; // final guess for this spot

  // tight on answer+closest for the finale, otherwise frame everything shown
  const cameraPoints = isClosest
    ? [[loc.lat, loc.lng], [revealed[revealed.length - 1].lat, revealed[revealed.length - 1].lng]]
    : [[loc.lat, loc.lng], ...revealed.map(g => [g.lat, g.lng])];

  // teams currently off-screen get an edge arrow instead of their on-map
  // label - showing both used to overlap right at the edge
  let mapSize = null;
  try { mapSize = map?.getSize() ?? null; } catch { mapSize = null; }
  const inView = (lat, lng) => {
    if (!map || !mapSize) return true;
    const pt = safeContainerPoint(map, lat, lng);
    if (!pt) return true;
    return pt.x >= 0 && pt.x <= mapSize.x && pt.y >= 0 && pt.y <= mapSize.y;
  };
  const edgePoints = [
    ...revealed.slice(0, bulkVisible).map(g => ({ ...g, color: FIELD_COLOR })),
    ...revealed.slice(bulkCount).map((g, i) => ({ ...g, color: LINE_COLORS[i % LINE_COLORS.length] })),
  ];

  return (
    <div className="reveal">
      <p className="round-progress">
        Round {round} reveal &mdash; location {loc.seq}
        {bulk && ` · the rest of the field (${shown} team${shown === 1 ? '' : 's'})`}
        {lastRevealed && ` · ${lastRevealed.team}: ${distanceLabel(lastRevealed.dist)} · ${lastRevealed.score.toLocaleString()} pts`}
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
            // the bulk group: muted dots with a name+score label centered
            // above, popping in one at a time as bulkVisible ramps up
            if (i < bulkCount) {
              if (i >= bulkVisible) return null;
              return (
                <React.Fragment key={g.team}>
                  <CircleMarker
                    center={[g.lat, g.lng]}
                    radius={5}
                    pathOptions={{ color: '#fff', weight: 1, fillColor: FIELD_COLOR, fillOpacity: 0.85, className: 'reveal-dot reveal-dot-field' }}
                  >
                    {inView(g.lat, g.lng) && (
                      <Tooltip permanent direction="top" offset={[0, -8]} className="reveal-tt reveal-tt-field">
                        {g.team} · {g.score.toLocaleString()} pts
                      </Tooltip>
                    )}
                  </CircleMarker>
                  <Polyline
                    positions={[[loc.lat, loc.lng], [g.lat, g.lng]]}
                    pathOptions={{ color: FIELD_COLOR, weight: 1.5, opacity: 0.5, className: 'reveal-line' }}
                  />
                </React.Fragment>
              );
            }
            const podiumIndex = i - bulkCount; // 0-based within the individually-stepped podium
            const color = LINE_COLORS[podiumIndex % LINE_COLORS.length];
            const rank = cur.length - i; // farthest-first, closest gets rank 1
            return (
              <React.Fragment key={g.team}>
                <CircleMarker
                  center={[g.lat, g.lng]}
                  radius={9}
                  pathOptions={{ color: '#fff', weight: 2, fillColor: color, fillOpacity: 1, className: 'reveal-dot' }}
                >
                  {inView(g.lat, g.lng) && (
                    <Tooltip permanent direction="auto" offset={[10, 0]} className={`reveal-tt tt-${podiumIndex}`}>
                      <b>{rank}.</b> {g.team} · {distanceLabel(g.dist)} · {g.score.toLocaleString()} pts
                    </Tooltip>
                  )}
                </CircleMarker>
                <Polyline
                  positions={[[loc.lat, loc.lng], [g.lat, g.lng]]}
                  pathOptions={{ color, weight: 3, className: 'reveal-line' }}
                />
              </React.Fragment>
            );
          })}
        </MapContainer>
        <EdgeArrows map={map} points={edgePoints} />
      </div>
      <p className="team-hint">The game runner is walking through the reveal</p>
    </div>
  );
}
