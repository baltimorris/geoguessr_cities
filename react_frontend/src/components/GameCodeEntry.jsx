import React, { useState } from 'react';
import Button from '@mui/material/Button';

export default function GameCodeEntry({ activeCode, onJoin }) {
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);

  const tryJoin = () => {
    if (entry === activeCode) {
      onJoin(entry);
    } else {
      setError(true);
    }
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
      <Button variant='contained' size='large' disabled={entry.length < 4} onClick={tryJoin}>
        Join
      </Button>
      {error && <p className="join-error">That's not it. Ask whoever's running the game.</p>}
    </div>
  );
}
