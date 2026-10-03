// ViewrView.jsx - the viewr's screen during a round: full-screen Street View of
// the current location with chips to switch between the round's locations.
// The viewr describes what they see; the guessr (who has the map) pins it.

import React, { useState, useEffect } from 'react';
import StreetView from './StreetView';
import { roundLabel } from '../scoring';

export default function ViewrView({ roundLocations, isDC, currentRound }) {
  const [active, setActive] = useState(0);

  useEffect(() => { setActive(0); }, [currentRound]);

  if (!roundLocations.length) {
    return (
      <div className="empty-round">
        <h2>No locations for {roundLabel(currentRound).toLowerCase()} yet</h2>
        <p className="team-hint">The game runner still has to upload them</p>
      </div>
    );
  }

  const current = roundLocations[Math.min(active, roundLocations.length - 1)];

  return (
    <div className="viewr-view">
      <div className="pano-stage">
        <StreetView isDC={isDC} location={current} />
      </div>
      <div className="location-chips">
        {roundLocations.map((l, i) => (
          <button
            key={`${l.round}-${l.seq}`}
            className={`chip ${i === active ? 'active' : ''}`}
            onClick={() => setActive(i)}
          >
            {l.seq}
          </button>
        ))}
      </div>
    </div>
  );
}
