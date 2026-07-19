import React from 'react';
import StreetView from './StreetView';

export default function MapprView({ roundLocations, isDC, currentRound }) {
  if (!roundLocations.length) {
    return (
      <div className="empty-round">
        <h2>No locations for round {currentRound} yet</h2>
        <p className="team-hint">The game runner still has to upload them</p>
      </div>
    );
  }

  return (
    <div className="mappr-view">
      <p className="round-progress">
        Round {currentRound} &mdash; swipe through the locations
      </p>
      <div className="pano-carousel">
        {roundLocations.map(l => (
          <div className="pano-slide" key={`${l.round}-${l.seq}`}>
            <div className="pano-label">{l.seq}</div>
            <StreetView isDC={isDC} location={l} />
          </div>
        ))}
      </div>
    </div>
  );
}
