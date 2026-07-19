import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';

// straight out of 05_score.R
const haversineFt = (lat1, lng1, lat2, lng2) => {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6378137; // meters, same sphere distHaversine uses
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a)) * 3.28084;
};

const scoreGuess = (distance, maxPoints, maxDist) => {
  let score = maxPoints * Math.exp(-10 * distance / maxDist);
  if (distance < 5280) score = score * 1.02;
  if (distance < 160) score = maxPoints;
  if (score > maxPoints) score = maxPoints;
  return Math.round(score);
};

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
      const maxDist = (game.city || 'DC') === 'DC' ? 73000 : 130000;
      const answerBySeq = Object.fromEntries(locations.map(l => [l.seq, l]));

      const scored = teams.map(t => {
        let total = 0;
        for (const loc of locations) {
          // latest guess wins, same as 05_score.R
          const latest = (guesses || [])
            .filter(g => g.team_id === t.id && g.location === loc.seq)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
          if (!latest) continue;
          const answer = answerBySeq[loc.seq];
          const dist = haversineFt(answer.lat, answer.lng, latest.lat, latest.lng);
          total += scoreGuess(dist, maxPoints, maxDist);
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
