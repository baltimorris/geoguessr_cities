import React, { useState, useEffect } from 'react';
import Button from '@mui/material/Button';

export default function TeamSetup({ gameCode, teamName, setTeamName, onReady }) {
  const [photo, setPhoto] = useState(null);
  const [guessrTaken, setGuessrTaken] = useState(false);

  // Stand-in for a backend check: claims live in localStorage until there's a server,
  // so two tabs on one device behave like two players on one team
  const claimKey = `guessr_${gameCode}_${teamName.trim().toLowerCase()}`;

  useEffect(() => {
    const check = () => setGuessrTaken(!!localStorage.getItem(claimKey));
    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, [claimKey]);

  const pickRole = (role) => {
    if (role === 'guessr') {
      localStorage.setItem(claimKey, '1');
    }
    onReady({ name: teamName.trim(), photo }, role);
  };

  const nameReady = teamName.trim().length > 0;

  return (
    <div className="team-setup">
      <h2>Team name</h2>
      <p className="team-hint">Everyone on your team enters the same name</p>
      <input
        className="team-name-input"
        maxLength={30}
        value={teamName}
        autoFocus
        placeholder="e.g. The Boshis"
        onChange={e => setTeamName(e.target.value)}
      />

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
      </div>
    </div>
  );
}
