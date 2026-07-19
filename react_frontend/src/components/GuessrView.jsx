import React, { useState, useEffect } from 'react';
import Button from '@mui/material/Button';
import MapView from './MapView';
import { supabase } from '../supabase';

const mmss = ms => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function GuessrView({ game, team, roundLocations, deadline, now }) {
  const round = game?.current_round || 1;
  const [sel, setSel] = useState(1);
  const [picks, setPicks] = useState({});
  const [locked, setLocked] = useState({});
  const [saving, setSaving] = useState(false);

  // fresh round, fresh everything
  useEffect(() => { setSel(1); setPicks({}); setLocked({}); }, [round]);

  const isDC = (game?.city || 'DC') === 'DC';
  const totalMs = (game?.settings?.roundMinutes ?? 15) * 60000;
  const remaining = deadline ? Math.max(0, deadline - now) : null;
  const timeUp = remaining === 0;

  const lockIn = async () => {
    const pick = picks[sel];
    if (!pick || timeUp) return;
    if (supabase && team?.id) {
      setSaving(true);
      await supabase.from('guesses').insert({
        team_id: team.id,
        round,
        location: sel,
        lat: pick.lat,
        lng: pick.lng,
      });
      setSaving(false);
    }
    setLocked(prev => ({ ...prev, [sel]: true }));
  };

  if (!roundLocations.length) {
    return (
      <div className="empty-round">
        <h2>No locations for round {round} yet</h2>
        <p className="team-hint">The game runner still has to upload them</p>
      </div>
    );
  }

  return (
    <div className="guessr-view">
      {remaining !== null && (
        <div className={`timer-bar ${remaining < 60000 ? 'urgent' : ''}`}>
          <div className="timer-fill" style={{ width: `${(remaining / totalMs) * 100}%` }} />
          <span className="timer-text">{mmss(remaining)}</span>
        </div>
      )}
      <p className="round-progress">Round {round}</p>
      <div className="location-chips">
        {roundLocations.map(l => (
          <button
            key={l.seq}
            className={`chip ${sel === l.seq ? 'active' : ''} ${locked[l.seq] ? 'locked' : picks[l.seq] ? 'picked' : ''}`}
            onClick={() => setSel(l.seq)}
          >
            {locked[l.seq] ? '✓ ' : ''}{l.seq}
          </button>
        ))}
      </div>
      <div className="map-container">
        <MapView
          isDC={isDC}
          position={picks[sel] || null}
          onPick={latlng => { if (!locked[sel] && !timeUp) setPicks(prev => ({ ...prev, [sel]: latlng })); }}
        />
      </div>
      <Button
        variant='contained'
        size='large'
        disabled={!picks[sel] || locked[sel] || timeUp || saving}
        onClick={lockIn}
      >
        {locked[sel] ? `Locked in ${sel}!` : saving ? 'Saving...' : `Lock in guess ${sel}`}
      </Button>
    </div>
  );
}
