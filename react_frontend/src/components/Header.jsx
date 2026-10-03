// Header.jsx - the striped header bar at the top of every screen, plus the
// settings gear. The gear opens the player-facing city toggle, the admin
// password gate, the admin setup form (game code, rounds, weights, practice,
// handicap) and, once a game exists, the AdminRemote overlay.

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Toggle from './Toggle';
import Btn from './Btn';
import AdminRemote from './AdminRemote';
import './Header.css';

const barClasses = ['RD', 'OR', 'BL', 'YL', 'GR', 'SV'];

// Set VITE_ADMIN_PASSWORD in .env.local (and in the host's env vars when
// deployed). There's deliberately no fallback value: a default sitting in the
// source is a password anyone can read. With it unset, admin stays locked.
// Note this is a gate on the admin *screens* only - the value ships inside
// the built JS, so it keeps casual players out, it is not real protection.
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || '';

// little ? that reveals a hint on hover or tap (tap matters on phones)
function InfoBadge({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="info-badge"
      tabIndex={0}
      onClick={() => setOpen(o => !o)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={() => setOpen(false)}
    >
      ?
      {open && <span className="info-pop">{text}</span>}
    </span>
  );
}

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

export default function Header({ settingsOpen, setSettingsOpen, isDC, setCity, gameSettings, setGameSettings, hideSettings, adminGame, onCreateGame, onNewGame, onStartGame, onEndRound, onRevealNext, onRevealBack, onNextRound, onFinishGame, onSeedLocations, generating, adminError, adminRoundOver, adminLocationCount = 0, adminFlaggedCount = 0, adminTeamCount = 0, revealTotal, revealLocationSteps, team, role, onLeaveGame, onOpenProjector, onReviewLocations }) {
  const isNYC = !isDC;
  // a reload shouldn't hand the runner's phone back to a player
  const wasAdmin = typeof localStorage !== 'undefined' && localStorage.getItem('lg_admin') === '1';
  const [adminUnlocked, setAdminUnlocked] = useState(wasAdmin);
  const [adminWarned, setAdminWarned] = useState(wasAdmin);
  const [pwEntry, setPwEntry] = useState('');
  const [pwError, setPwError] = useState(false);

  const cityKey = isDC ? 'dc' : 'nyc';
  const showRemote = adminUnlocked && !!adminGame;

  const tryUnlock = () => {
    if (ADMIN_PASSWORD && pwEntry === ADMIN_PASSWORD) {
      setAdminUnlocked(true);
      setPwError(false);
      localStorage.setItem('lg_admin', '1');
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
        <Btn onClick={() => setAdminWarned(true)}>Got it, I'm running this game</Btn>
      </div>
    );
  }

  // Setup panel = pre-game config. Remote = drive a game that already exists.
  const setupPanel = (
    <>
      <div className="city-question">Which city?</div>
      <label className="city-toggle">
        <span style={{ fontWeight: isDC ? 'bold' : 'normal', opacity: isDC ? 1 : 0.5 }}>DC</span>
        <Toggle checked={isNYC} onChange={() => setCity(prev => !prev)} />
        <span style={{ fontWeight: isNYC ? 'bold' : 'normal', opacity: isNYC ? 1 : 0.5 }}>NYC</span>
      </label>

      <div className="city-question">Admin</div>
      {onOpenProjector && (
        <Btn variant="outline" onClick={onOpenProjector}>📽️ Project a reveal</Btn>
      )}
      <label className="admin-field">
        Game code
        <input
          className="code-input"
          maxLength={4}
          placeholder="AUTO"
          value={gameSettings.code}
          onChange={e => setGameSettings({
            ...gameSettings,
            code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
          })}
        />
      </label>
      <label className="admin-field">
        Max points per location
        <input type="number" value={gameSettings.maxPoints}
          onChange={e => setGameSettings({ ...gameSettings, maxPoints: Number(e.target.value) })} />
      </label>
      <div className="admin-grid">
        <label className="admin-field">
          Rounds
          <input type="number" value={gameSettings.rounds}
            onChange={e => setGameSettings({ ...gameSettings, rounds: Number(e.target.value) })} />
        </label>
        <label className="admin-field">
          Locations per round
          <input type="number" value={gameSettings.locationsPerRound}
            onChange={e => setGameSettings({ ...gameSettings, locationsPerRound: Number(e.target.value) })} />
        </label>
        <label className="admin-field">
          Round minutes
          <input type="number" value={gameSettings.roundMinutes}
            onChange={e => setGameSettings({ ...gameSettings, roundMinutes: Number(e.target.value) })} />
        </label>
        <label className="admin-field">
          Max team size
          <input type="number" min="1" value={gameSettings.maxTeamSize}
            onChange={e => setGameSettings({ ...gameSettings, maxTeamSize: Math.max(1, Number(e.target.value)) })} />
        </label>
      </div>
      <label className="admin-field handicap-row">
        <Toggle
          checked={gameSettings.practice !== false}
          onChange={e => setGameSettings({ ...gameSettings, practice: e.target.checked })}
        />
        Practice round first
        <InfoBadge text="A warm-up on the same few famous spots every game, before round 1. It's revealed like a real round but never counts toward the score." />
      </label>
      {gameSettings.practice !== false && (
        <label className="admin-field">
          Practice minutes
          <input type="number" min="1" value={gameSettings.practiceMinutes ?? 4}
            onChange={e => setGameSettings({ ...gameSettings, practiceMinutes: Math.max(1, Number(e.target.value)) })} />
        </label>
      )}
      <label className="admin-field handicap-row">
        <Toggle
          checked={gameSettings.handicap}
          onChange={e => setGameSettings({ ...gameSettings, handicap: e.target.checked })}
        />
        Team size handicap
        <InfoBadge text="When on, bigger teams score a bit lower: solos and pairs play at par, then every extra player past two shaves ~4% off that team's points." />
      </label>
      <div className="city-question">{isDC ? 'DC' : 'NYC'} location weights</div>
      <div className="admin-grid">
        {(isDC ? dcWeightFields : nycWeightFields).map(([key, label]) => (
          <label className="admin-field" key={key}>
            {label}
            <input type="number" value={gameSettings[cityKey][key]}
              onChange={e => setGameSettings({
                ...gameSettings,
                [cityKey]: { ...gameSettings[cityKey], [key]: Number(e.target.value) },
              })} />
          </label>
        ))}
      </div>
      {adminError && <p className="pw-error">{adminError}</p>}
      <Btn className="btn-lg" onClick={onCreateGame}>Create game</Btn>
    </>
  );

  return (
    <motion.header
      className="header"
      // the remote control renders as its own centered overlay, so only the
      // plain settings pane needs the header itself to grow and make room.
      // vh, not %: this header is styled position:relative (see below), so a
      // % height resolves against .app-container - which is only ever a
      // reliable full-screen box when ITS OWN height is unambiguous. Content
      // shorter than one screen (like the code entry form) leaves that
      // ambiguous, and the settings pane silently clipped to the header's
      // CSS min-height instead of actually expanding. vh sidesteps that
      // entirely by resolving straight against the viewport.
      animate={{ height: settingsOpen && !showRemote ? '100vh' : '15vh' }}
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
            transition={{ delay: i * 0.1, duration: 0.4, ease: 'easeOut' }}
          />
        ))}
      </div>

      <motion.div
        className={`header-text-container ${role ? 'has-team' : ''}`}
        animate={{ opacity: settingsOpen ? 0 : 1, y: settingsOpen ? 20 : 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="header-text">
          <AnimatePresence>
            {isNYC && (
              <motion.span
                className="nyc-arrow"
                initial={{ opacity: 0, x: -20, y: -20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, x: -20, y: -20 }}
                transition={{ delay: 0.6, duration: 0.4, ease: 'easeOut' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M2.5 2.5L20 20" />
                  <polyline points="21.5,10 21.5,21.5 10,21.5" />
                </svg>
              </motion.span>
            )}
          </AnimatePresence>
          <span className="header-text-label">LocalGuessr</span>
          <span className="dc-float">{isNYC ? 'NYC' : 'DC'}</span>
        </div>
        {role && team && (
          <div className="header-team-line">
            {team.emoji && <span className="team-emoji">{team.emoji}</span>}
            <span className="team-name-text">Team {team.name}</span>
            <button className="leave-link" onClick={onLeaveGame}>not you?</button>
          </div>
        )}
      </motion.div>

      {/* Gear Button, goes away once you've committed to a team */}
      {!hideSettings && (
        <button className="settings-button" onClick={() => setSettingsOpen(prev => !prev)}>
          <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-label="Settings">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.48.48 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z" />
          </svg>
        </button>
      )}

      {/* Settings panel - password gate and pre-game setup only. Once a game
          exists, the gear opens the centered remote control below instead. */}
      <AnimatePresence>
        {settingsOpen && !showRemote && (
          <motion.div
            className="settings-pane"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <h2>Settings</h2>
            {!adminUnlocked ? (
              <div className="admin-section">
                {/* city toggle stays available to players glancing at settings */}
                <div className="city-question">Which city?</div>
                <label className="city-toggle">
                  <span style={{ fontWeight: isDC ? 'bold' : 'normal', opacity: isDC ? 1 : 0.5 }}>DC</span>
                  <Toggle checked={isNYC} onChange={() => setCity(prev => !prev)} />
                  <span style={{ fontWeight: isNYC ? 'bold' : 'normal', opacity: isNYC ? 1 : 0.5 }}>NYC</span>
                </label>
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
              </div>
            ) : (
              <div className="admin-section">{setupPanel}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Remote control - a centered "what happens next" panel once a game exists,
          instead of a wall of buttons you could tap in any order */}
      <AnimatePresence>
        {settingsOpen && showRemote && (
          <AdminRemote
            game={adminGame}
            locationCount={adminLocationCount}
            flaggedCount={adminFlaggedCount}
            teamCount={adminTeamCount}
            generating={generating}
            error={adminError}
            roundOver={adminRoundOver}
            revealTotal={revealTotal}
            revealLocationSteps={revealLocationSteps}
            onClose={() => setSettingsOpen(false)}
            onSeedLocations={onSeedLocations}
            onStartGame={onStartGame}
            onEndRound={onEndRound}
            onRevealNext={onRevealNext}
            onRevealBack={onRevealBack}
            onNextRound={onNextRound}
            onFinishGame={onFinishGame}
            onNewGame={onNewGame}
            onOpenProjector={onOpenProjector}
            onReviewLocations={onReviewLocations}
          />
        )}
      </AnimatePresence>
    </motion.header>
  );
}
