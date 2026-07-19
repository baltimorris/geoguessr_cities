import React from 'react';
import StreetView from './StreetView';

export default function MapprView({ roundLocations, isDC, currentRound }) {
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
