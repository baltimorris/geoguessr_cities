import React from 'react';
import { motion } from 'framer-motion';
import Btn from './Btn';
import './AdminRemote.css';

// Drives the actual game once it exists. One primary button that IS whatever
// happens next (start, end round, reveal next, next round, finish...) instead
// of a wall of buttons you could tap in the wrong order or past the end of
// the reveal - plus a back button for the one step it's safe to undo.
export default function AdminRemote({
  game, locationCount, generating, error, roundOver, revealTotal,
  onClose, onSeedLocations, onStartGame, onEndRound,
  onRevealNext, onRevealBack, onNextRound, onFinishGame, onNewGame,
}) {
  const rounds = game.settings?.rounds ?? 3;
  const round = game.current_round || 1;
  const step = game.reveal_step || 0;
  const lastRound = round >= rounds;
  // revealTotal is still loading right after a round ends - don't block on it,
  // just don't claim the reveal is "done" until we actually know that
  const revealDone = roundOver && revealTotal !== null && step >= revealTotal;

  let status = '';
  let primary = null;

  if (game.status === 'lobby') {
    if (locationCount === 0) {
      status = 'Waiting on locations';
      primary = {
        label: generating ? 'Finding street views…' : 'Generate locations',
        onClick: onSeedLocations, disabled: generating, variant: 'outline',
      };
    } else {
      status = `${locationCount} locations loaded — tell people the code`;
      primary = { label: 'Start game', onClick: onStartGame };
    }
  } else if (game.status === 'active') {
    if (!roundOver) {
      status = `Round ${round} of ${rounds} — guessing`;
      primary = { label: 'End round now', onClick: onEndRound, variant: 'outline' };
    } else if (!revealDone) {
      const shown = revealTotal ? Math.min(step + 1, revealTotal) : step + 1;
      status = `Revealing round ${round} — ${shown} of ${revealTotal ?? '…'}`;
      primary = { label: 'Reveal next ▸', onClick: onRevealNext };
    } else {
      status = `Round ${round} fully revealed`;
      primary = lastRound
        ? { label: 'Finish game ▸', onClick: onFinishGame, variant: 'danger' }
        : { label: `Start round ${round + 1} ▸`, onClick: onNextRound };
    }
  } else {
    status = 'Game over, scores are up';
    primary = { label: 'Set up a new game', onClick: onNewGame };
  }

  const showBack = game.status === 'active' && roundOver && step > 0;
  // the primary button already IS "finish game" once the last round's fully
  // revealed - no need for the escape hatch to repeat itself right under it
  const showFinishEscape = game.status === 'active' && !(revealDone && lastRound);

  return (
    <motion.div
      className="admin-remote-backdrop"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="admin-remote"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 10 }}
        transition={{ duration: 0.2 }}
      >
        <div className="admin-remote-code">{game.code}</div>
        <p className="admin-remote-status">{status}</p>
        {error && <p className="pw-error">{error}</p>}

        <Btn
          className="btn-lg admin-remote-primary"
          variant={primary.variant || 'primary'}
          disabled={primary.disabled}
          onClick={primary.onClick}
        >
          {primary.label}
        </Btn>

        {showBack && (
          <button className="admin-remote-back" onClick={onRevealBack}>&#9664; Back</button>
        )}

        {game.status !== 'finished' && (
          <div className="admin-remote-footer">
            {showFinishEscape && (
              <button
                className="admin-remote-link"
                onClick={() => { if (window.confirm('Finish the game for everyone right now?')) onFinishGame(); }}
              >
                Finish game now
              </button>
            )}
            <button
              className="admin-remote-link"
              onClick={() => {
                if (window.confirm('End the current game and reset for a new one? This boots everyone.')) onNewGame();
              }}
            >
              New game (ends this one &amp; resets)
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
