import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

// Random waypoints for the bubble to drift between
const drift = (range, n = 6) =>
  [0, ...Array.from({ length: n }, () => Math.round((Math.random() * 2 - 1) * range))];

export default function Lobby({ role, team, player, setPlayer }) {
  const xPath = useMemo(() => drift(120), []);
  const yPath = useMemo(() => drift(140), []);
  const roleEmoji = role === 'mappr' ? '\u{1F5FA}️' : '\u{1F4F7}';

  // Just your own bubble until the backend brings in teammates
  return (
    <div className="lobby">
      <h2>You're in!</h2>
      <p className="team-hint">Hang tight until the game runner starts things off</p>
      <input
        className="player-tag-input"
        maxLength={12}
        placeholder="emoji or name"
        value={player.tag}
        onChange={e => setPlayer({ ...player, tag: e.target.value })}
      />
      <div className="lobby-area">
        <motion.div
          className="bubble"
          animate={{ x: xPath, y: yPath }}
          transition={{ duration: 30, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        >
          <span className="bubble-role">{roleEmoji}</span>
          <span className="bubble-tag">{player.tag || team.name}</span>
        </motion.div>
      </div>
    </div>
  );
}
