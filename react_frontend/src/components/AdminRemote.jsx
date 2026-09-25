import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Btn from './Btn';
import './AdminRemote.css';

// Drives the actual game once it exists. One primary button that IS whatever
// happens next (start, end round, reveal next, next round, finish...) instead
// of a wall of buttons you could tap in the wrong order or past the end of
// the reveal - plus a back button for the one step it's safe to undo.
export default function AdminRemote({
  game, locationCount, teamCount = 0, generating, error, roundOver, revealTotal, revealLocationSteps,
  onClose, onSeedLocations, onStartGame, onEndRound,
  onRevealNext, onRevealBack, onNextRound, onFinishGame, onNewGame,
}) {
  // each of these is a round trip to Supabase - an eager double/triple-tap
  // used to fire several requests that all read the same stale reveal_step
  // and only stepped once, silently swallowing taps. A useState gate isn't
  // enough here: two synchronous clicks both close over the same pre-update
  // "busy" value before React ever re-renders, so both slip through. A ref
  // updates immediately, so the second click actually sees the first one.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false); // only drives the disabled look
  const guarded = fn => async (...args) => {
    if (busyRef.current || !fn) return;
    busyRef.current = true;
    setBusy(true);
    try { await fn(...args); } finally { busyRef.current = false; setBusy(false); }
  };

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
    const teamNote = `${teamCount} team${teamCount === 1 ? '' : 's'} checked in`;
    if (locationCount === 0) {
      status = `Waiting on locations · ${teamNote}`;
      primary = {
        label: generating ? 'Finding street views…' : 'Generate locations',
        onClick: onSeedLocations, disabled: generating, variant: 'outline',
      };
    } else {
      status = `${locationCount} locations loaded · ${teamNote}`;
      primary = { label: 'Start game', onClick: onStartGame };
    }
  } else if (game.status === 'active') {
    if (!roundOver) {
      status = `Round ${round} of ${rounds} — guessing`;
      primary = { label: 'End round now', onClick: onEndRound, variant: 'outline' };
    } else if (!revealDone) {
      // last round gets 3 extra steps after its locations, one per place, so
      // the runner hands over 3rd/2nd/1st one at a time instead of the whole
      // podium landing at once - once we're past the locations, relabel the
      // button so they know exactly which place they're about to announce
      const inTopReveal = lastRound && revealLocationSteps !== null && step >= revealLocationSteps;
      if (inTopReveal) {
        const place = 3 - (step - revealLocationSteps); // 3rd, then 2nd, then 1st
        const placeLabel = place === 1 ? '1st' : place === 2 ? '2nd' : '3rd';
        status = 'Announcing the top 3…';
        primary = { label: `Reveal ${placeLabel} place ▸`, onClick: onRevealNext };
      } else {
        const shown = revealLocationSteps ? Math.min(step + 1, revealLocationSteps) : step + 1;
        status = `Revealing round ${round} — ${shown} of ${revealLocationSteps ?? '…'}`;
        primary = { label: 'Reveal next ▸', onClick: onRevealNext };
      }
    } else {
      status = lastRound ? 'Top 3 revealed!' : `Round ${round} fully revealed`;
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
          disabled={primary.disabled || busy}
          onClick={guarded(primary.onClick)}
        >
          {primary.label}
        </Btn>

        {showBack && (
          <Btn
            variant="outline"
            className="btn-lg admin-remote-primary"
            disabled={busy}
            onClick={guarded(onRevealBack)}
          >
            &#9664; Back
          </Btn>
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
