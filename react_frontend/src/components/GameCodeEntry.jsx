import React, { useState } from 'react';
import Button from '@mui/material/Button';
import { supabase } from '../supabase';

export default function GameCodeEntry({ activeCode, onJoin }) {
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const tryJoin = async () => {
    // Local-only fallback when supabase env vars aren't set
    if (!supabase) {
      if (entry === activeCode) onJoin({ code: entry, status: 'lobby' });
      else setError(true);
      return;
    }
    setChecking(true);
    // codes get recycled, so only ever join the game that's still running
    const { data } = await supabase.from('games')
      .select().eq('code', entry).neq('status', 'finished')
      .order('created_at', { ascending: false }).limit(1);
    setChecking(false);
    if (data?.length) onJoin(data[0]);
    else setError(true);
  };

  return (
    <div className="code-entry">
      <h2>Enter game code</h2>
      <input
        className="code-entry-input"
        maxLength={4}
        value={entry}
        autoFocus
        onChange={e => {
          setEntry(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
          setError(false);
        }}
        onKeyDown={e => { if (e.key === 'Enter' && entry.length === 4) tryJoin(); }}
      />
      <Button variant='contained' size='large' disabled={entry.length < 4 || checking} onClick={tryJoin}>
        {checking ? 'Checking...' : 'Join'}
      </Button>
      {error && <p className="join-error">No game found. Ask Jay or Drew for the right code!</p>}
    </div>
  );
}
