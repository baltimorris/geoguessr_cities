import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

// One spot on the final podium - "???" until the admin hands it to us, then
// pops in with a little spring. Keying the revealed/pending content lets it
// actually remount (rather than just re-render) so the pop-in replays.
function PodiumSlot({ rank, team }) {
  const cls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze';
  const label = rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd';
  const emoji = rank === 1 ? '🏆' : rank === 2 ? '🥈' : '🥉';
  return (
    <div className={`final-podium-slot ${cls} ${team ? 'revealed' : ''}`}>
      <span className="final-podium-rank">{emoji} {label}</span>
      <AnimatePresence mode="wait">
        {team ? (
          <motion.div
            key="revealed"
            className="final-podium-content"
            initial={{ opacity: 0, scale: 0.4, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 16 }}
          >
            <span className="final-podium-name">
              {team.name}{team.size > 2 && ` · ${team.size} players`}
            </span>
            <span className="final-podium-score">{team.total.toLocaleString()}</span>
          </motion.div>
        ) : (
          <motion.div key="pending" className="final-podium-mystery" initial={false}>???</motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Pure fidget toy for the room while they wait between announcements - no
// sound, no game effect, just something to tap. Shakes while held, same
// idea as a real drumroll building up, and settles back when released.
function DrumButton() {
  return (
    <motion.button
      type="button"
      className="drum-button"
      whileTap={{ x: [0, -3, 3, -3, 3, 0], transition: { duration: 0.15, repeat: Infinity } }}
      aria-label="Drumroll (just for fun, doesn't affect the game)"
    >
      🥁
    </motion.button>
  );
}

export default function RoundReveal({ game, locations, isDC, team }) {
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
    const isFinalRound = round >= totalRounds;

    if (!isFinalRound) {
      return (
        <div className="results">
          <h2>Round {round} standings</h2>
          <Standings
            rows={data.standings}
            renderScore={r => `+${r.roundScore.toLocaleString()} → ${r.total.toLocaleString()}`}
          />
          <p className="team-hint">Hang tight, the next round starts soon</p>
        </div>
      );
    }

    // The finale: 4th place and below just show up, no suspense needed
    // there. The top 3 stay "???" until the runner hands them over one at a
    // time (3rd, then 2nd, then 1st) so they can announce each one - that's
    // everything past the location frames, one step per place.
    const topReveal = Math.max(0, Math.min(3, step - frames.length));
    const podium = data.standings.slice(0, 3); // [1st, 2nd, 3rd]
    const rest = data.standings.slice(3);
    return (
      <div className="results final-countdown">
        <h2>Final scores</h2>
        {rest.length > 0 && (
          <ol className="results-list final-countdown-rest">
            {rest.map(r => (
              <li key={r.name}>
                <span className="results-team">
                  {r.name}{r.size > 2 && <span className="team-size-tag"> · {r.size} players</span>}
                </span>
                <span className="results-score">{r.total.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="final-podium">
          {podium[2] && <PodiumSlot rank={3} team={topReveal >= 1 ? podium[2] : null} />}
          {podium[1] && <PodiumSlot rank={2} team={topReveal >= 2 ? podium[1] : null} />}
          {podium[0] && <PodiumSlot rank={1} team={topReveal >= 3 ? podium[0] : null} />}
        </div>
        <DrumButton />
      </div>
    );
  }

  const { shown } = frame;
  const revealed = cur.slice(0, shown);
  const bulkVisible = bulk ? Math.min(bulkShown, bulkCount) : bulkCount;
  const isClosest = shown === cur.length && cur.length > 0; // final guess for this spot

  const isOwnTeam = g => !!team?.name && g.team.trim().toLowerCase() === team.name.trim().toLowerCase();

  // Which of the "shown" dots are actually on screen right now. During the
  // bulk step the field pops in as it ramps; once we're stepping through the
  // podium the field fades out again except for the viewer's own team, so
  // they can still see where they landed without the rest of the crowd.
  const dotVisible = revealed.map((g, i) => {
    if (i >= bulkCount) return true; // podium always shown
    return bulk ? i < bulkVisible : isOwnTeam(g);
  });
  const shownPoints = revealed.filter((_, i) => dotVisible[i]);

  // tight on answer+closest for the finale, otherwise frame whatever's
  // actually on screen (not the hidden stragglers)
  const cameraPoints = isClosest
    ? [[loc.lat, loc.lng], [revealed[revealed.length - 1].lat, revealed[revealed.length - 1].lng]]
    : [[loc.lat, loc.lng], ...shownPoints.map(g => [g.lat, g.lng])];

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
  const edgePoints = revealed
    .map((g, i) => ({ ...g, visible: dotVisible[i], color: i < bulkCount ? FIELD_COLOR : LINE_COLORS[(i - bulkCount) % LINE_COLORS.length] }))
    .filter(g => g.visible);

  return (
    <div className="reveal">
      <div className="reveal-heading">
        <h2 className="reveal-heading-title">Round {round} Reveal</h2>
        <p className="reveal-heading-location"><em>Location {loc.seq}</em></p>
      </div>
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
            // the bulk group: muted dots with a placement+name+score label
            // centered above, popping in one at a time as bulkVisible ramps
            // up - then fading to just the viewer's own team (if any) once
            // we move on to stepping through the podium
            if (i < bulkCount) {
              if (!dotVisible[i]) return null;
              const fieldRank = cur.length - i; // farthest-first, closest gets rank 1
              return (
                <React.Fragment key={g.team}>
                  <CircleMarker
                    center={[g.lat, g.lng]}
                    radius={5}
                    pathOptions={{ color: '#fff', weight: 1, fillColor: FIELD_COLOR, fillOpacity: 0.85, className: 'reveal-dot reveal-dot-field' }}
                  >
                    {inView(g.lat, g.lng) && (
                      <Tooltip permanent direction="top" offset={[0, -8]} className="reveal-tt reveal-tt-field">
                        <b>{fieldRank}.</b> {g.team} · {g.score.toLocaleString()} pts
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
