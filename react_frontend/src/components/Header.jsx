import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import { FaCog } from 'react-icons/fa';
import './Header.css';

const barClasses = ['RD', 'OR', 'BL', 'YL', 'GR', 'SV'];

const ADMIN_PASSWORD = 'pylon'; // temp until there's a real backend

// key in gameSettings -> label, mirrors the percents in 00_parameters.R
const dcWeightFields = [
  ['at_large', 'At-large %'],
  ['downtown', 'Downtown %'],
  ['greater_central', 'Greater central %'],
  ['metro', 'Metro %'],
  ['metro_distance', 'Metro distance (ft)'],
];
const nycWeightFields = [
  ['manhattan', 'Manhattan %'],
  ['brooklyn', 'Brooklyn %'],
  ['queens', 'Queens %'],
  ['bronx', 'Bronx %'],
  ['subway', 'Subway %'],
  ['subway_distance', 'Subway distance (ft)'],
];

export default function Header({ settingsOpen, setSettingsOpen, isDC, setCity, gameSettings, setGameSettings, hideSettings, adminGame, onCreateGame, onStartGame, onEndRound, onNextRound, onFinishGame, onSeedLocations, generating, adminError, adminLocationCount = 0 }) {
  const isNYC = !isDC;
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminWarned, setAdminWarned] = useState(false);
  const [pwEntry, setPwEntry] = useState('');
  const [pwError, setPwError] = useState(false);

  const cityKey = isDC ? 'dc' : 'nyc';

  const tryUnlock = () => {
    if (pwEntry === ADMIN_PASSWORD) {
      setAdminUnlocked(true);
      setPwError(false);
    } else {
      setPwError(true);
    }
    setPwEntry('');
  };

  if (adminUnlocked && !adminWarned) {
    return (
      <div className="admin-takeover">
        <h1>Admin mode</h1>
        <p>
          This phone is now the game runner. You can't hand it back to a player
          until the game is over, so make sure this is the phone you want running things.
        </p>
        <Button variant='contained' size='large' onClick={() => setAdminWarned(true)}>
          Got it, I'm running this game
        </Button>
      </div>
    );
  }

  return (
    <motion.header
      className="header"
      animate={{ height: settingsOpen ? '100%' : '15vh' }}
      transition={{ duration: 0.4 }}
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      <div className="bars-container">
        {barClasses.map((cls, i) => (
          <motion.div
            key={cls}
            className={cls}
            initial={{ height: isNYC ? '100%' : 0 }}
            animate={{ height: isNYC ? 0 : '100%' }}
            transition={{
              delay: i * 0.1,
              duration: 0.4,
              ease: 'easeOut'
            }}
          />
        ))}
      </div>

      <motion.div
        className="header-text-container"
        animate={{
          opacity: settingsOpen ? 0 : 1,
          y: settingsOpen ? 20 : 0
          
        }}
        transition={{ duration: 0.4 }}
      >
        <AnimatePresence>
          {isNYC && (
            <motion.div
              className="nyc-arrow"
              initial={{ opacity: 0, x: -20, y: -20 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: -20, y: -20 }}
              transition={{ delay: 0.6, duration: 0.4, ease: 'easeOut' }}
            >
              {/* MTA-style wayfinding arrow: shaft plus two head lines, hard edges, pointing SE */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M2.5 2.5L20 20" />
                <polyline points="21.5,10 21.5,21.5 10,21.5" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="dc-float">{isNYC ? 'NYC' : 'DC'}</div>
        <div className="header-text">LocalGuessr</div>
      </motion.div>

      {/* Gear Button, goes away once you've committed to a team */}
      {!hideSettings && (
        <button className="settings-button" onClick={() => setSettingsOpen(prev => !prev)}>
          <FaCog />
        </button>
      )}


      {/* Settings Panel */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            className="settings-pane"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <h2>Settings</h2>
            <div className="city-question">Which city?</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: isDC ? 'bold' : 'normal', opacity: isDC ? 1 : 0.5 }}>DC</span>
              <Switch
                checked={isNYC}
                onChange={() => setCity(prev => !prev)}
              />
              <span style={{ fontWeight: isNYC ? 'bold' : 'normal', opacity: isNYC ? 1 : 0.5 }}>NYC</span>
            </label>

            <div className="admin-section">
              {adminUnlocked ? (
                <>
                  <div className="city-question">Admin</div>
                  <label className="admin-field">
                    Game code
                    <input
                      className="code-input"
                      maxLength={4}
                      placeholder="AUTO"
                      value={gameSettings.code}
                      onChange={e => setGameSettings({
                        ...gameSettings,
                        code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                      })}
                    />
                  </label>
                  <label className="admin-field">
                    Max points per location
                    <input
                      type="number"
                      value={gameSettings.maxPoints}
                      onChange={e => setGameSettings({ ...gameSettings, maxPoints: Number(e.target.value) })}
                    />
                  </label>
                  <div className="admin-grid">
                    <label className="admin-field">
                      Rounds
                      <input
                        type="number"
                        value={gameSettings.rounds}
                        onChange={e => setGameSettings({ ...gameSettings, rounds: Number(e.target.value) })}
                      />
                    </label>
                    <label className="admin-field">
                      Locations per round
                      <input
                        type="number"
                        value={gameSettings.locationsPerRound}
                        onChange={e => setGameSettings({ ...gameSettings, locationsPerRound: Number(e.target.value) })}
                      />
                    </label>
                    <label className="admin-field">
                      Round minutes
                      <input
                        type="number"
                        value={gameSettings.roundMinutes}
                        onChange={e => setGameSettings({ ...gameSettings, roundMinutes: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                  {!adminGame && (
                    <Button variant='contained' size='large' onClick={onCreateGame}>
                      Create game
                    </Button>
                  )}
                  {adminError && <p className="pw-error">{adminError}</p>}
                  {adminGame && adminLocationCount === 0 && (
                    <>
                      <p className="admin-warning">
                        No locations yet &mdash; run 07_upload_round.R with code {adminGame.code},
                        or grab some random ones to test with
                      </p>
                      <Button variant='outlined' disabled={generating} onClick={onSeedLocations}>
                        {generating ? 'Finding street views...' : 'Generate locations'}
                      </Button>
                    </>
                  )}
                  {adminGame && adminLocationCount > 0 && (
                    <p className="admin-game-live">{adminLocationCount} locations loaded</p>
                  )}
                  {adminGame?.status === 'lobby' && (
                    <>
                      <p className="admin-game-live">Game <b>{adminGame.code}</b> is up, tell people the code</p>
                      <Button variant='contained' size='large' onClick={onStartGame}>
                        Start game
                      </Button>
                    </>
                  )}
                  {adminGame?.status === 'active' && (
                    <>
                      <p className="admin-game-live">
                        Game <b>{adminGame.code}</b> &mdash; round {adminGame.current_round || 1} of {adminGame.settings?.rounds ?? 3}
                      </p>
                      <div className="admin-round-buttons">
                        <Button variant='contained' onClick={onEndRound}>
                          End round
                        </Button>
                        <Button
                          variant='contained'
                          disabled={(adminGame.current_round || 1) >= (adminGame.settings?.rounds ?? 3)}
                          onClick={onNextRound}
                        >
                          Next round
                        </Button>
                        <Button variant='outlined' onClick={onFinishGame}>
                          Finish game
                        </Button>
                      </div>
                    </>
                  )}
                  {adminGame?.status === 'finished' && (
                    <p className="admin-game-live">Game <b>{adminGame.code}</b> is done, scores are up</p>
                  )}
                  <div className="city-question">{isDC ? 'DC' : 'NYC'} location weights</div>
                  <div className="admin-grid">
                    {(isDC ? dcWeightFields : nycWeightFields).map(([key, label]) => (
                      <label className="admin-field" key={key}>
                        {label}
                        <input
                          type="number"
                          value={gameSettings[cityKey][key]}
                          onChange={e => setGameSettings({
                            ...gameSettings,
                            [cityKey]: { ...gameSettings[cityKey], [key]: Number(e.target.value) }
                          })}
                        />
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <label className="admin-field">
                  Admin password
                  <input
                    type="password"
                    value={pwEntry}
                    onChange={e => { setPwEntry(e.target.value); setPwError(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') tryUnlock(); }}
                  />
                  {pwError && <span className="pw-error">nope</span>}
                </label>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
