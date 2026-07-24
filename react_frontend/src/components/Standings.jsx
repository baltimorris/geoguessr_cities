import React from 'react';
import { motion } from 'framer-motion';

// Everyone below third slides up quick, then the podium comes in one at a time
const delayFor = (i, n) => {
  if (i >= 3) return 0.06 * (n - 1 - i);
  const quick = n > 3 ? 0.06 * (n - 3) + 0.35 : 0.2;
  return quick + (2 - i) * 0.6;
};

const MEDAL_CLASS = ['gold', 'silver', 'bronze'];
const MEDAL_EMOJI = ['\u{1F3C6}', '\u{1F948}', '\u{1F949}']; // trophy, silver, bronze

export default function Standings({ rows, renderScore }) {
  return (
    <ol className="results-list">
      {rows.map((r, i) => (
        <motion.li
          key={r.name}
          className={MEDAL_CLASS[i] || ''}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: delayFor(i, rows.length),
            duration: i < 3 ? 0.5 : 0.25,
            ease: 'easeOut',
          }}
        >
          <span className="results-team">
            {i < 3 ? `${MEDAL_EMOJI[i]} ` : ''}{r.name}
            {r.size > 2 && <span className="team-size-tag"> · {r.size} players</span>}
          </span>
          <span className="results-score">{renderScore(r)}</span>
        </motion.li>
      ))}
    </ol>
  );
}
