import React, { useState, useEffect } from 'react';
import Btn from './Btn';
import MapView from './MapView';
import { supabase } from '../supabase';
import { PRACTICE_ROUND, roundLabel, roundMinutesFor } from '../scoring';

const mmss = ms => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function GuessrView({ game, team, roundLocations, deadline, now }) {
  const round = game?.current_round ?? 1;
  const [sel, setSel] = useState(1);
  const [picks, setPicks] = useState({});
  const [locked, setLocked] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // fresh round, fresh everything - then pull back any guesses already saved
  // for it, so a refresh mid-round (phone locks, tab reloads) doesn't make it
  // look like locked-in guesses vanished and need re-doing
  useEffect(() => {
    setSel(1);
    setPicks({});
    setLocked({});
    setSaveError('');
    if (!supabase || !team?.id) return;
    let cancelled = false;
    supabase.from('guesses').select('location,lat,lng,created_at')
      .eq('team_id', team.id).eq('round', round)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data?.length) return;
        const restoredPicks = {}, restoredLocked = {};
        for (const g of data) {
          if (restoredPicks[g.location]) continue; // newest first, so first seen wins
          restoredPicks[g.location] = { lat: g.lat, lng: g.lng };
          restoredLocked[g.location] = true;
        }
        setPicks(restoredPicks);
        setLocked(restoredLocked);
      });
    return () => { cancelled = true; };
  }, [round, team?.id]);

  const isDC = (game?.city || 'DC') === 'DC';
  const totalMs = roundMinutesFor(game?.settings, round) * 60000;
  const remaining = deadline ? Math.max(0, deadline - now) : null;
  const timeUp = remaining === 0;

  const lockIn = async () => {
    const pick = picks[sel];
    if (!pick || timeUp) return;
    setSaveError('');
    if (supabase && team?.id) {
      setSaving(true);
      // bar wifi drops inserts silently if you don't check this - this used to
      // just assume it worked and mark the guess locked either way, so a team
      // could "lock in" a guess that never actually made it to the db and never
      // know until the reveal came up short for a location they sworn they'd guessed
      const { error } = await supabase.from('guesses').insert({
        team_id: team.id,
        round,
        location: sel,
        lat: pick.lat,
        lng: pick.lng,
      });
      setSaving(false);
      if (error) { setSaveError("Didn't save - check your connection and try again"); return; }
    }
    setLocked(prev => ({ ...prev, [sel]: true }));
  };

  // reopens the pin for editing - doesn't touch what's already saved, the
  // next lock-in just adds a newer row and the scoring already takes
  // whichever guess per team/round/location has the latest timestamp
  const unlock = () => setLocked(prev => ({ ...prev, [sel]: false }));

  if (!roundLocations.length) {
    return (
      <div className="empty-round">
        <h2>No locations for {roundLabel(round).toLowerCase()} yet.</h2>
        <p className="team-hint">Jay still has to pull the lever and grab some locations!</p>
      </div>
    );
  }

  return (
    <div className="guessr-view">
      {remaining !== null && (
        <div className={`timer-bar ${remaining < 60000 ? 'urgent' : ''} ${remaining < totalMs / 2 ? 'low' : ''}`}>
          <div className="timer-fill" style={{ width: `${(remaining / totalMs) * 100}%` }} />
          <span className="timer-text">{mmss(remaining)}</span>
        </div>
      )}
      <p className="round-progress">{roundLabel(round)}</p>
      {round === PRACTICE_ROUND && (
        <p className="team-hint">Just a warm-up, none of this counts. Get a feel for the street view and the map.</p>
      )}
      <div className="location-chips">
        {roundLocations.map(l => (
          <button
            key={l.seq}
            className={`chip ${sel === l.seq ? 'active' : ''} ${locked[l.seq] ? 'locked' : picks[l.seq] ? 'picked' : ''}`}
            onClick={() => { setSel(l.seq); setSaveError(''); }}
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
      <Btn
        className="btn-lg"
        disabled={!picks[sel] || locked[sel] || timeUp || saving}
        onClick={lockIn}
      >
        {locked[sel] ? `Locked in ${sel}!` : saving ? 'Saving…' : `Lock in guess ${sel}`}
      </Btn>
      {saveError && <p className="join-error">{saveError}</p>}
      {locked[sel] && !timeUp && (
        <button className="leave-link" onClick={unlock}>Change this guess</button>
      )}
    </div>
  );
}
