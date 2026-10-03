// AdminMapView.jsx - the projector screen. The admin types a game code and gets
// the round reveal full-width (for a TV/projector) without joining as a team.
// It mirrors whatever reveal step the admin is on from their own phone.

import React, { useState, useEffect } from 'react';
import Btn from './Btn';
import RoundReveal from './RoundReveal';
import { supabase } from '../supabase';
import { roundLabel, roundMinutesFor } from '../scoring';

// Full-width reveal for a projector or TV, reachable straight from the
// admin-unlocked settings pane without joining as a team - type the game
// code once and it just mirrors whatever reveal_step the runner is
// stepping through from their own phone, same as any player would see,
// just nobody's "own team" so the field never gets the self-team exception.
export default function AdminMapView({ onClose, defaultCode = '' }) {
  const [codeEntry, setCodeEntry] = useState(defaultCode);
  const [game, setGame] = useState(null);
  const [locations, setLocations] = useState([]);
  const [error, setError] = useState('');
  const [looking, setLooking] = useState(false);
  const [now, setNow] = useState(Date.now());

  // own clock tick - this view lives outside App.jsx's normal screen tree,
  // so it needs to know when a round's actually over itself
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const connect = async () => {
    const code = codeEntry.trim().toUpperCase();
    if (!code || !supabase) return;
    setLooking(true);
    setError('');
    // codes get reused once a game finishes, so only look at the one still running
    const { data } = await supabase.from('games')
      .select().eq('code', code).neq('status', 'finished')
      .order('created_at', { ascending: false }).limit(1);
    setLooking(false);
    if (!data?.length) { setError('No live game with that code'); return; }
    setGame(data[0]);
  };

  // re-pull the spots whenever the game moves on, so a spot the runner swapped
  // after this screen connected can't leave the projector showing a stale answer
  useEffect(() => {
    if (!supabase || !game?.id) return;
    let cancelled = false;
    supabase.from('locations')
      .select('round,seq,lat,lng,heading').eq('game_id', game.id)
      .order('round').order('seq')
      .then(({ data: locs }) => { if (!cancelled) setLocations(locs || []); });
    return () => { cancelled = true; };
  }, [game?.id, game?.status, game?.current_round]);

  // follow the game live, same as a player's own session does
  useEffect(() => {
    if (!supabase || !game?.id) return;
    const channel = supabase.channel(`admin-map-${game.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
        payload => setGame(prev => ({ ...prev, ...payload.new })))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [game?.id]);

  const switchGame = () => { setGame(null); setLocations([]); setError(''); };

  // don't let the projector get ahead of the room - no guess pins up on a
  // big screen until the round the runner's actually revealing is over
  const deadline = game?.round_started_at
    ? new Date(game.round_started_at).getTime() + roundMinutesFor(game.settings, game.current_round ?? 1) * 60000
    : null;
  const roundOver = game?.status === 'finished' || (deadline !== null && now >= deadline);

  return (
    <div className="admin-map-view">
      <div className="admin-map-bar">
        {game && <span className="admin-map-code">{game.code}</span>}
        <div className="admin-map-bar-actions">
          {game && <button className="leave-link" onClick={switchGame}>switch game</button>}
          <button className="leave-link" onClick={onClose}>close</button>
        </div>
      </div>

      {!game ? (
        <div className="admin-map-connect">
          <h2>Project a reveal</h2>
          <p className="team-hint">Enter the game's code - no need to join as a team</p>
          <input
            className="code-entry-input"
            maxLength={4}
            value={codeEntry}
            autoFocus
            onChange={e => setCodeEntry(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={e => { if (e.key === 'Enter' && codeEntry.length === 4) connect(); }}
          />
          <Btn className="btn-lg" disabled={codeEntry.length < 4 || looking} onClick={connect}>
            {looking ? 'Looking…' : 'Open'}
          </Btn>
          {error && <p className="join-error">{error}</p>}
        </div>
      ) : !roundOver ? (
        <div className="admin-map-waiting">
          <h2>{game.status === 'lobby' ? 'Waiting for the game to start' : `${roundLabel(game.current_round ?? 1)} is still going`}</h2>
          <p className="team-hint">The reveal shows up here once the round's over</p>
        </div>
      ) : (
        <div className="admin-map-stage">
          <RoundReveal game={game} locations={locations} isDC={(game.city || 'DC') === 'DC'} team={null} />
        </div>
      )}
    </div>
  );
}
