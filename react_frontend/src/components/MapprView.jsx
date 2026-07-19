import React, { useRef, useState, useEffect } from 'react';
import StreetView from './StreetView';

export default function MapprView({ roundLocations, isDC, currentRound }) {
  const scroller = useRef(null);
  const [active, setActive] = useState(0);

  useEffect(() => { setActive(0); scroller.current?.scrollTo({ left: 0 }); }, [currentRound]);

  // Only the slide you're looking at gets a live panorama. Five at once eats five
  // WebGL contexts and phones just render them black.
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    let best = 0, bestDist = Infinity;
    [...el.children].forEach((kid, i) => {
      const dist = Math.abs(kid.offsetLeft - el.scrollLeft);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    setActive(best);
  };

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
        Round {currentRound} &mdash; location {active + 1} of {roundLocations.length}, swipe for more
      </p>
      <div className="pano-carousel" ref={scroller} onScroll={onScroll}>
        {roundLocations.map((l, i) => (
          <div className="pano-slide" key={`${l.round}-${l.seq}`}>
            <div className="pano-label">{l.seq}</div>
            {i === active
              ? <StreetView isDC={isDC} location={l} />
              : <div className="pano-placeholder">{l.seq}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
