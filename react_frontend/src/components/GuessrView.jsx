import React, { useState, useEffect } from 'react';
import Button from '@mui/material/Button';
import MapView from './MapView';
import { supabase } from '../supabase';

export default function GuessrView({ game, team, locations }) {
  const [pick, setPick] = useState(null);
  const [lockedSeq, setLockedSeq] = useState(null);
  const [saving, setSaving] = useState(false);

  const seq = game?.current_seq || 1;

  // fresh location, fresh pick
  useEffect(() => { setPick(null); }, [seq]);
  const total = locations.length;
  const isDC = (game?.city || 'DC') === 'DC';
  const locked = lockedSeq === seq;

  const lockIn = async () => {
    if (!pick) return;
    if (supabase && team?.id) {
      setSaving(true);
      await supabase.from('guesses').insert({
        team_id: team.id,
        round: 1,
        location: seq,
        lat: pick.lat,
        lng: pick.lng,
      });
      setSaving(false);
    }
    setLockedSeq(seq);
  };

  return (
    <div className="guessr-view">
      <p className="round-progress">Location {seq}{total ? ` of ${total}` : ''}</p>
      {/* key resets the marker when the runner advances */}
      <div className="map-container">
        <MapView key={seq} isDC={isDC} onPick={setPick} />
      </div>
      <Button
        variant='contained'
        size='large'
        disabled={!pick || locked || saving}
        onClick={lockIn}
      >
        {locked ? 'Locked in!' : saving ? 'Saving...' : 'Lock in guess'}
      </Button>
      {locked && <p className="team-hint">Waiting for the next location</p>}
    </div>
  );
}
