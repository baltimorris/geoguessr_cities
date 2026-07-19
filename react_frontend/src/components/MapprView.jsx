import React, { useState, useEffect } from 'react';
import StreetView from './StreetView';

export default function MapprView({ roundLocations, isDC, currentRound }) {
  const [active, setActive] = useState(0);

  useEffect(() => { setActive(0); }, [currentRound]);

  if (!roundLocations.length) {
    return (
      <div className="empty-round">
        <h2>No locations for round {currentRound} yet</h2>
        <p className="team-hint">The game runner still has to upload them</p>
      </div>
    );
  }

  const current = roundLocations[Math.min(active, roundLocations.length - 1)];

  return (
    <div className="mappr-view">
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
