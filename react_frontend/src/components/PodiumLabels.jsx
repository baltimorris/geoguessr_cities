// PodiumLabels.jsx - the name / distance / points pills for the top guesses on
// the reveal map. Leaflet's own tooltips can only sit left or right of a dot, so
// when several guesses landed near each other (they usually do) the pills piled
// on top of each other and couldn't be read from a zoomed-out view.
//
// This lays them out itself: every pill tries a ring of spots around its dot
// (right, left, above, below, the diagonals, then farther out) and takes the one
// that overlaps the least - other pills, other dots, the answer marker, the map
// edge. A pill that had to move away from its dot gets a thin leader line back to
// it. Layout runs when the map settles (not on every frame of a pan/zoom), and
// pills fade in after the camera lands. Dots that are off-screen are skipped -
// the edge arrows in RoundReveal already point at those.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { distanceLabel } from '../scoring';

const GAP = 4; // breathing room kept between pills
const DOT = 22; // box around a podium dot that a pill must not cover
// how far (px) from its dot a pill may sit; anything past the first needs a leader line
const RINGS = [10, 44, 90];
// try right first, then left, up, down, then diagonals
const DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];

const overlapArea = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
const inflate = (r, by) => ({ x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 });

// items: [{ key, lat, lng, color, rank, team, dist, score }] in reveal order
// avoid: [{ lat, lng, w, h, dy? }] boxes centred on a point (the answer marker,
//        its "Location N" label, emoji dots) that pills should stay off
export default function PodiumLabels({ map, items, avoid }) {
  const refs = useRef({});
  const [placed, setPlaced] = useState({});
  const [moving, setMoving] = useState(false);
  const [settleTick, setSettleTick] = useState(0);

  useEffect(() => {
    if (!map) return undefined;
    const start = () => setMoving(true);
    const end = () => { setMoving(false); setSettleTick(t => t + 1); };
    map.on('movestart zoomstart', start);
    map.on('moveend zoomend resize', end);
    return () => { map.off('movestart zoomstart', start); map.off('moveend zoomend resize', end); };
  }, [map]);

  const sig = items.map(i => `${i.key}:${i.lat},${i.lng}:${i.rank}:${i.score}`).join(';');
  const avoidSig = avoid.map(a => `${a.lat},${a.lng},${a.w},${a.h},${a.dy || 0}`).join(';');

  useLayoutEffect(() => {
    if (!map) return;
    let size;
    try { size = map.getSize(); } catch { return; }
    const project = (lat, lng) => { try { return map.latLngToContainerPoint([lat, lng]); } catch { return null; } };
    const bounds = { x: 0, y: 0, w: size.x, h: size.y };

    const obstacles = [];
    for (const a of avoid) {
      const p = project(a.lat, a.lng);
      if (p) obstacles.push({ x: p.x - a.w / 2, y: p.y + (a.dy || 0) - a.h / 2, w: a.w, h: a.h });
    }
    const dots = [];
    for (const it of items) {
      const p = project(it.lat, it.lng);
      if (!p) continue;
      dots.push({ it, p });
      obstacles.push({ x: p.x - DOT / 2, y: p.y - DOT / 2, w: DOT, h: DOT, owner: it.key });
    }

    const taken = [];
    const out = {};
    for (const { it, p } of dots) {
      if (p.x < 0 || p.y < 0 || p.x > size.x || p.y > size.y) continue; // an edge arrow covers this one
      const el = refs.current[it.key];
      if (!el) continue;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let best = null;
      RINGS.forEach((ring, ri) => DIRS.forEach(([sx, sy], di) => {
        const cx = p.x + sx * (ring + w / 2);
        const cy = p.y + sy * (ring + h / 2);
        const rect = { x: cx - w / 2, y: cy - h / 2, w, h };
        const padded = inflate(rect, GAP / 2);
        let cost = ri * 50 + di * 2;
        cost += (w * h - overlapArea(rect, bounds)) * 8; // hanging off the map
        for (const t of taken) cost += overlapArea(padded, t) * 10;
        for (const o of obstacles) if (o.owner !== it.key) cost += overlapArea(rect, o) * 6;
        if (!best || cost < best.cost) best = { cost, rect, ri };
      }));
      taken.push(inflate(best.rect, GAP / 2));
      const { rect } = best;
      out[it.key] = {
        x: rect.x,
        y: rect.y,
        // a thin line from the dot to the nearest point of a pill that had to move away
        leader: best.ri > 0
          ? { x1: p.x, y1: p.y, x2: Math.max(rect.x, Math.min(p.x, rect.x + w)), y2: Math.max(rect.y, Math.min(p.y, rect.y + h)) }
          : null,
      };
    }
    setPlaced(out);
    // `items` and `avoid` are summarised by sig / avoidSig on purpose: new
    // arrays with the same contents shouldn't redo the layout
  }, [map, sig, avoidSig, settleTick]);

  return (
    <div className="podium-layer">
      <svg className={`podium-leaders ${moving ? 'off' : ''}`} aria-hidden="true">
        {items.map(it => {
          const l = placed[it.key]?.leader;
          return l && <line key={it.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={it.color} strokeWidth="2" strokeLinecap="round" />;
        })}
      </svg>
      {items.map(it => {
        const pl = placed[it.key];
        return (
          <div
            key={it.key}
            ref={el => { if (el) refs.current[it.key] = el; else delete refs.current[it.key]; }}
            className={`podium-label ${pl && !moving ? 'is-on' : ''}`}
            style={{ left: pl ? pl.x : 0, top: pl ? pl.y : 0, '--tt-c': it.color }}
          >
            <b>{it.rank}.</b> {it.team}<br />{distanceLabel(it.dist)} | {it.score.toLocaleString()} pts
          </div>
        );
      })}
    </div>
  );
}
