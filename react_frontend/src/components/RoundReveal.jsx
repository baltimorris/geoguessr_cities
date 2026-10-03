import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapContainer, Marker, CircleMarker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ThemedTiles from './ThemedTiles';
import { supabase } from '../supabase';
import Standings from './Standings';
import PodiumSlot from './PodiumSlot';
import StreetThumb from './StreetThumb';
import { distanceLabel, REVEAL_PODIUM_SIZE, PRACTICE_ROUND, roundLabel } from '../scoring';

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

// just a team's emoji, no pill, no name - a big room means a dozen-plus of
// these on screen at once, and giving every one of them a full name+score
// label was the thing making it unreadable on a phone
const emojiIcon = emoji => L.divIcon({
  className: 'reveal-emoji-icon',
  html: emoji || '❓',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
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
          {p.team}<br />{distanceLabel(p.dist)}
        </span>
      </div>
    );
  });
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
  const round = game?.current_round ?? 1; // 0 = practice
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
      // scoring itself (distance, handicap, points) lives in the db now -
      // guess_scores and team_round_scores already have the math done, this
      // just shapes what comes back for the map and the standings list
      const { data: teams } = await supabase.from('teams')
        .select('name,size').eq('game_id', game.id);
      if (!teams?.length) { setData({ byLoc: {}, standings: [] }); return; }
      const { data: scores } = await supabase.from('guess_scores')
        .select('team_name,team_emoji,scored_team_size,round,location_seq,guess_lat,guess_lng,distance_ft,points')
        .eq('game_id', game.id).eq('is_latest', true);
      const { data: roundRows } = await supabase.from('team_round_scores')
        .select('team_name,round,round_points,running_total')
        .eq('game_id', game.id).lte('round', round);

      const byLoc = {};
      for (const loc of roundLocations) {
        byLoc[loc.seq] = (scores || [])
          .filter(s => s.round === round && s.location_seq === loc.seq)
          .map(s => ({ team: s.team_name, emoji: s.team_emoji, lat: s.guess_lat, lng: s.guess_lng, dist: s.distance_ft, score: s.points }))
          .sort((a, b) => b.dist - a.dist);
      }

      // team_round_scores has one row per round a team actually played -
      // collapse to the latest one each team has (<=round, from the query
      // above) for their running total, same as "standings after round N"
      const latestRowByTeam = new Map();
      for (const r of roundRows || []) {
        const prev = latestRowByTeam.get(r.team_name);
        if (!prev || r.round > prev.round) latestRowByTeam.set(r.team_name, r);
      }
      const sizeByTeam = new Map((scores || []).map(s => [s.team_name, s.scored_team_size]));
      // every team shows up even at 0 - a team with no guesses yet has no
      // row in team_round_scores at all, but still belongs on the board
      const standings = teams.map(t => {
        const r = latestRowByTeam.get(t.name);
        return {
          name: t.name,
          roundScore: r && r.round === round ? r.round_points : 0,
          total: r ? r.running_total : 0,
          size: sizeByTeam.get(t.name) || t.size || 1,
        };
      }).sort((a, b) => b.total - a.total);

      // rank movement vs. where the team stood after the previous round, so
      // the standings screen can show "up 2" / "down 1" instead of just a
      // static list - no prior round on round 1, so no deltas there.
      let prevRank = null;
      if (round > 1) {
        const priorStandings = teams.map(t => {
          const priorTotal = (roundRows || []).find(x => x.team_name === t.name && x.round === round - 1)?.running_total ?? 0;
          return { name: t.name, total: priorTotal };
        }).sort((a, b) => b.total - a.total);
        prevRank = {};
        priorStandings.forEach((t, i) => { prevRank[t.name] = i + 1; });
      }
      const standingsWithDelta = standings.map((r, i) => ({
        ...r,
        rankDelta: prevRank && prevRank[r.name] != null ? prevRank[r.name] - (i + 1) : null,
      }));

      setData({ byLoc, standings: standingsWithDelta });
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

    if (round === PRACTICE_ROUND) {
      return (
        <div className="results">
          <h2>That's the practice round</h2>
          <p className="team-hint">None of that counted. Round 1 is the real thing, starting soon</p>
        </div>
      );
    }

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
        {/* reads top to bottom like any other standings list - 1st down to
            last - the top 3 just show "???" until the runner hands each one
            over, instead of getting stacked below everyone else */}
        <div className="final-podium">
          {podium[0] && <PodiumSlot rank={1} team={topReveal >= 3 ? podium[0] : null} />}
          {podium[1] && <PodiumSlot rank={2} team={topReveal >= 2 ? podium[1] : null} />}
          {podium[2] && <PodiumSlot rank={3} team={topReveal >= 1 ? podium[2] : null} />}
        </div>
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
        <DrumButton />
      </div>
    );
  }

  const { shown } = frame;
  const revealed = cur.slice(0, shown);
  const bulkVisible = bulk ? Math.min(bulkShown, bulkCount) : bulkCount;
  const isClosest = shown === cur.length && cur.length > 0; // final guess for this spot

  const isOwnTeam = g => !!team?.name && g.team.trim().toLowerCase() === team.name.trim().toLowerCase();

  // Two states per field dot: not yet appeared (still popping in during the
  // bulk step - stays fully hidden), or appeared. Podium spots and the
  // viewer's own team get the full balloon+label; every other field member
  // that's appeared is muted down to just their emoji, full stop - not only
  // once we reach the podium steps. A 17-team round means a dozen-plus of
  // these, and giving every one of them a name+score pill (even just while
  // popping in) was the thing making a big room unreadable on a phone.
  const dotAppeared = revealed.map((g, i) => {
    if (i >= bulkCount) return true; // podium always shown
    return bulk ? i < bulkVisible : true; // field's bulk step has already run its course
  });
  const dotMuted = revealed.map((g, i) => {
    if (i >= bulkCount) return false; // podium always gets the full treatment
    return !isOwnTeam(g);
  });
  // camera still needs to frame muted teams too - "muted" only changes how
  // they're drawn (emoji instead of a full balloon), not whether they're on
  // the map at all, so leaving them out of the fit left a tight zoom on
  // just the answer pin with a dozen emoji scattered off-screen
  const shownPoints = revealed.filter((_, i) => dotAppeared[i]);

  // tight on answer+closest for the finale, otherwise frame whatever's
  // actually appeared (not the ones still waiting their turn to pop in)
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
    .map((g, i) => ({ ...g, visible: dotAppeared[i] && !dotMuted[i], color: i < bulkCount ? FIELD_COLOR : LINE_COLORS[(i - bulkCount) % LINE_COLORS.length] }))
    .filter(g => g.visible);

  return (
    <div className="reveal">
      <div className="reveal-heading">
        <h2 className="reveal-heading-title">{roundLabel(round)} Reveal</h2>
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
            // the bulk group: everyone except the viewer's own team is just
            // their emoji, no balloon, no label - popping in one at a time
            // as bulkVisible ramps up. own team still gets the full dot +
            // name + score pill so they can always find themselves.
            if (i < bulkCount) {
              if (!dotAppeared[i]) return null;
              if (dotMuted[i]) {
                return (
                  <React.Fragment key={g.team}>
                    <Marker position={[g.lat, g.lng]} icon={emojiIcon(g.emoji)} />
                    <Polyline
                      positions={[[loc.lat, loc.lng], [g.lat, g.lng]]}
                      pathOptions={{ color: FIELD_COLOR, weight: 1.5, opacity: 0.35, className: 'reveal-line' }}
                    />
                  </React.Fragment>
                );
              }
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
                        <b>{fieldRank}.</b> {g.team}<br />{g.score.toLocaleString()} pts
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
                      <b>{rank}.</b> {g.team}<br />{distanceLabel(g.dist)} | {g.score.toLocaleString()} pts
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
        {/* so everyone (and the runner) remembers what the spot actually looked like */}
        <StreetThumb key={`${round}-${loc.seq}`} className="reveal-thumb" lat={loc.lat} lng={loc.lng} heading={loc.heading}
                     isDC={isDC} label={`${roundLabel(round)} · Location ${loc.seq}`} />
      </div>
      <p className="team-hint">The game runner is walking through the reveal</p>
    </div>
  );
}
