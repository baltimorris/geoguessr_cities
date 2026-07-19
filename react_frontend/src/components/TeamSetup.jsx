import React, { useState, useEffect } from 'react';
import Button from '@mui/material/Button';
import { supabase } from '../supabase';

export default function TeamSetup({ game, teamName, setTeamName, onReady }) {
  const [photo, setPhoto] = useState(null);
  const [claimedNames, setClaimedNames] = useState({});
  const [localTaken, setLocalTaken] = useState(false);
  const [oops, setOops] = useState('');

  const name = teamName.trim();

  // Live view of which teams already have a guessr
  useEffect(() => {
    if (!supabase || !game?.id) return;
    supabase.from('teams').select('name,guessr_claimed').eq('game_id', game.id)
      .then(({ data }) => {
        if (data) setClaimedNames(Object.fromEntries(data.map(t => [t.name.toLowerCase(), t.guessr_claimed])));
      });
    const channel = supabase.channel(`teams-${game.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `game_id=eq.${game.id}` },
        payload => {
          const row = payload.new;
          if (row?.name) setClaimedNames(prev => ({ ...prev, [row.name.toLowerCase()]: row.guessr_claimed }));
        })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [game?.id]);

  // Local-only fallback when supabase env vars aren't set
  const claimKey = `guessr_${game?.code}_${name.toLowerCase()}`;
  useEffect(() => {
    if (supabase) return;
    const check = () => setLocalTaken(!!localStorage.getItem(claimKey));
    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, [claimKey]);

  const guessrTaken = supabase ? !!claimedNames[name.toLowerCase()] : localTaken;

  const pickRole = async (role) => {
    if (!supabase || !game?.id) {
      if (role === 'guessr') localStorage.setItem(claimKey, '1');
      onReady({ name, photo }, role);
      return;
    }
    const { data: teamRow, error } = await supabase.from('teams')
      .upsert({ game_id: game.id, name }, { onConflict: 'game_id,name' })
      .select().single();
    if (error || !teamRow) {
      setOops("Couldn't join the team, try again");
      return;
    }
    if (role === 'guessr') {
      // first write wins, whoever gets here second sees zero rows come back
      const { data: claimed } = await supabase.from('teams')
        .update({ guessr_claimed: true })
        .eq('id', teamRow.id).eq('guessr_claimed', false)
        .select();
      if (!claimed?.length) {
        setClaimedNames(prev => ({ ...prev, [name.toLowerCase()]: true }));
        return;
      }
    }
    onReady({ id: teamRow.id, name, photo }, role);
  };

  const nameReady = name.length > 0;

  return (
    <div className="team-setup">
      <h2>Team name</h2>
      <p className="team-hint">Everyone on your team enters the same name</p>
      <div className="team-name-field">
        <span className="team-prefix">Team</span>
        <input
          className="team-name-input"
          maxLength={30}
          value={teamName}
          autoFocus
          placeholder="Boshis"
          onChange={e => setTeamName(e.target.value)}
        />
      </div>

      <Button variant='outlined' component='label'>
        {photo ? 'Change team photo' : 'Team photo'}
        <input
          type="file"
          hidden
          accept="image/*"
          onChange={e => {
            const file = e.target.files[0];
            if (file) setPhoto(URL.createObjectURL(file));
          }}
        />
      </Button>
      {photo && <img className="team-photo" src={photo} alt="team" />}

      <div className="role-buttons">
        <Button
          variant='contained'
          size='large'
          disabled={!nameReady || guessrTaken}
          onClick={() => pickRole('guessr')}
        >
          Be the Guessr
        </Button>
        {guessrTaken && <p className="team-hint">Your team already has a guessr</p>}
        <Button
          variant='contained'
          size='large'
          disabled={!nameReady}
          onClick={() => pickRole('mappr')}
        >
          Be a Mappr
        </Button>
        {oops && <p className="join-error">{oops}</p>}
      </div>
    </div>
  );
}
