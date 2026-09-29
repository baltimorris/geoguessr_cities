import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import PodiumSlot from './PodiumSlot';
import { haversineFt, scoreWithHandicap, latestGuess, maxDistForCity, mergeTeams } from '../scoring';

// The persisted "game's over" screen everyone lands on once the runner
// finishes it - same podium-on-top layout as the live final-round reveal
// (RoundReveal.jsx), just already fully revealed, so there's no jarring
// swap from "top 3 dramatically announced" to "oh, a totally different list".
export default function Results({ game, locations }) {
  const [standings, setStandings] = useState(null);

  useEffect(() => {
    if (!supabase || !game?.id) return;
    // locations arrive as a separate async fetch up in App.jsx - on a refresh
    // right as the game finishes, this effect could run before that's landed
    // and score everyone at 0 off an empty location list. Wait for a real
    // fetch instead of flashing that; the `locations` dependency below
    // reruns this once it shows up.
    if (!locations.length) return;
    (async () => {
      const { data: teams } = await supabase.from('teams')
        .select('id,name,size').eq('game_id', game.id);
      if (!teams?.length) { setStandings([]); return; }
      const { data: guesses } = await supabase.from('guesses')
        .select('*').in('team_id', teams.map(t => t.id));

      const maxPoints = game.settings?.maxPoints || 5000;
      const maxDist = maxDistForCity(game.city);
      const handicap = game.settings?.handicap !== false;
      const cap = game.settings?.maxTeamSize || Infinity;

      const scored = mergeTeams(teams).map(t => {
        const size = Math.min(t.size, cap);
        let total = 0;
        for (const loc of locations) {
          const g = latestGuess(guesses || [], t.ids, loc.round, loc.seq);
          if (!g) continue;
          total += scoreWithHandicap(haversineFt(loc.lat, loc.lng, g.lat, g.lng), maxPoints, maxDist, size, handicap);
        }
        return { name: t.name, total, size };
      }).sort((a, b) => b.total - a.total);
      setStandings(scored);
    })();
    // locations arrive async on a refresh; recompute when they land or scores read 0
  }, [game?.id, locations]);

  if (!standings) return <p>Tallying scores...</p>;
  if (standings.length === 0) {
    return (
      <div className="results">
        <h2>Final scores</h2>
        <p className="team-hint">Nobody guessed anything?</p>
      </div>
    );
  }

  const podium = standings.slice(0, 3);
  const rest = standings.slice(3);

  return (
    <div className="results final-countdown">
      <h2>Final scores</h2>
      <div className="final-podium">
        {podium[0] && <PodiumSlot rank={1} team={podium[0]} />}
        {podium[1] && <PodiumSlot rank={2} team={podium[1]} />}
        {podium[2] && <PodiumSlot rank={3} team={podium[2]} />}
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
    </div>
  );
}
