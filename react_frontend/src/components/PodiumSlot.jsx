import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// One spot on the final podium - "???" until handed over, then pops in with
// a little spring. Keying the revealed/pending content lets it actually
// remount (rather than just re-render) so the pop-in replays. Shared between
// the live reveal (team arrives late, one place at a time) and the final
// scores page (team is there from the first render, already fully revealed).
export default function PodiumSlot({ rank, team }) {
  const cls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze';
  const label = rank === 1 ? '1st' : rank === 2 ? '2nd' : '3rd';
  const emoji = rank === 1 ? '🏆' : rank === 2 ? '🥈' : '🥉';
  return (
    <div className={`final-podium-slot ${cls} ${team ? 'revealed' : ''}`}>
      <span className="final-podium-rank">{emoji} {label}</span>
      <AnimatePresence mode="wait">
        {team ? (
          <motion.div
            key="revealed"
            className="final-podium-content"
            initial={{ opacity: 0, scale: 0.4, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 16 }}
          >
            <span className="final-podium-name">
              {team.name}{team.size > 2 && ` · ${team.size} players`}
            </span>
            <span className="final-podium-score">{team.total.toLocaleString()}</span>
          </motion.div>
        ) : (
          <motion.div key="pending" className="final-podium-mystery" initial={false}>???</motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
