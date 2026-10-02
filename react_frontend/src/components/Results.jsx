import React, { useState, useEffect } from 'react';
import Btn from './Btn';
import { supabase } from '../supabase';
import PodiumSlot from './PodiumSlot';

const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScJJ1YFUFOIs0m035PpYzOIdJPMMy1mf80-lfhl1tJ5SbucFQ/viewform?usp=publish-editor';

// The persisted "game's over" screen everyone lands on once the runner
// finishes it - same podium-on-top layout as the live final-round reveal
// (RoundReveal.jsx), just already fully revealed, so there's no jarring
// swap from "top 3 dramatically announced" to "oh, a totally different list".
export default function Results({ game, locations, onLeaveGame }) {
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
      // scoring lives in the db now - team_total_scores already has every
      // team's final tally, this just fills in anyone who scored nothing
      const { data: teams } = await supabase.from('teams')
        .select('name,size').eq('game_id', game.id);
      if (!teams?.length) { setStandings([]); return; }
      const { data: totals } = await supabase.from('team_total_scores')
        .select('team_name,total_points').eq('game_id', game.id);
      const { data: scores } = await supabase.from('guess_scores')
        .select('team_name,scored_team_size').eq('game_id', game.id).eq('is_latest', true);

      const totalByTeam = new Map((totals || []).map(t => [t.team_name, t.total_points]));
      const sizeByTeam = new Map((scores || []).map(s => [s.team_name, s.scored_team_size]));
      const scored = teams.map(t => ({
        name: t.name,
        total: totalByTeam.get(t.name) || 0,
        size: sizeByTeam.get(t.name) || t.size || 1,
      })).sort((a, b) => b.total - a.total);
      setStandings(scored);
    })();
    // locations arrive async on a refresh; recompute when they land or scores read 0
  }, [game?.id, locations]);

  if (!standings) return <p>Tallying scores...</p>;

  const podium = standings.slice(0, 3);
  const rest = standings.slice(3);

  return (
    <div className="results final-countdown results-page">
      <h2>Final scores</h2>
      {standings.length === 0 ? (
        <p className="team-hint">Nobody guessed anything?</p>
      ) : (
        <>
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
        </>
      )}

      {/* no more auto-leave timer - nothing boots you off this screen on its
          own, including once the runner starts a fresh game, so there needs
          to be an obvious way off it instead of just the small "not you?"
          up in the header that nobody reads as "leave" */}
      {onLeaveGame && (
        <Btn variant="outline" onClick={onLeaveGame}>Done, back to code entry</Btn>
      )}

      {/* a good, unhurried moment to catch people for feedback while
          they're all still standing around. a floating link instead of a
          QR - they're already ON the phone this is showing on, scanning it
          would mean a second device - and fixed to the screen instead of
          sitting at the bottom of the standings means it's still right
          there even with a long team list to scroll past */}
      <a
        className="feedback-float"
        href={FEEDBACK_FORM_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Let us know what you think!!
      </a>
    </div>
  );
}
