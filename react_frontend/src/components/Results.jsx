import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import Standings from './Standings';
import { haversineFt, scoreWithHandicap, latestGuess, maxDistForCity, mergeTeams } from '../scoring';

export default function Results({ game, locations }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!supabase || !game?.id) return;
    (async () => {
      const { data: teams } = await supabase.from('teams')
        .select('id,name,size').eq('game_id', game.id);
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
          total += scoreWithHandicap(haversineFt(loc.lat, loc.lng, g.lat, g.lng), maxPoints, maxDist, t.size);
        }
        return { name: t.name, score: total, size: t.size };
      }).sort((a, b) => b.score - a.score);
      setRows(scored);
    })();
  }, [game?.id]);

  if (!rows) return <p>Tallying scores...</p>;

  return (
    <div className="results">
      <h2>Final scores</h2>
      {rows.length === 0 && <p className="team-hint">Nobody guessed anything?</p>}
      <Standings rows={rows} renderScore={r => r.score.toLocaleString()} />
    </div>
  );
}
