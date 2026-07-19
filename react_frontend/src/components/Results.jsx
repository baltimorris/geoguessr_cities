import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { haversineFt, scoreGuess, latestGuess, maxDistForCity, mergeTeams } from '../scoring';

export default function Results({ game, locations }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!supabase || !game?.id) return;
    (async () => {
      const { data: teams } = await supabase.from('teams')
        .select('id,name').eq('game_id', game.id);
      if (!teams?.length) { setRows([]); return; }
      const { data: guesses } = await supabase.from('guesses')
        .select('*').in('team_id', teams.map(t => t.id));

      const maxPoints = game.settings?.maxPoints || 5000;
      const maxDist = maxDistForCity(game.city);

      const scored = mergeTeams(teams).map(t => {
        let total = 0;
        for (const loc of locations) {
          const g = latestGuess(guesses || [], t.ids, loc.round, loc.seq);
          if (!g) continue;
          total += scoreGuess(haversineFt(loc.lat, loc.lng, g.lat, g.lng), maxPoints, maxDist);
        }
        return { name: t.name, score: total };
      }).sort((a, b) => b.score - a.score);
      setRows(scored);
    })();
  }, [game?.id]);

  if (!rows) return <p>Tallying scores...</p>;

  return (
    <div className="results">
      <h2>Final scores</h2>
      {rows.length === 0 && <p className="team-hint">Nobody guessed anything?</p>}
      <ol className="results-list">
        {rows.map((r, i) => (
          <li key={r.name} className={i === 0 ? 'winner' : ''}>
            <span className="results-team">{i === 0 ? '\u{1F3C6} ' : ''}{r.name}</span>
            <span className="results-score">{r.score.toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
