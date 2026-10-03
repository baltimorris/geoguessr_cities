import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import StreetView, { loadMaps } from './StreetView';

// A small still view of a spot - the QC list and the reveal both use it.
// The Street View Static API isn't enabled on the project's key (only the
// Maps JS API is), so this is a real panorama with every control off and
// pointer events blocked, which reads as a picture. It only builds once it
// scrolls into view, so a long QC list isn't 15 panos loading at once.
// Tap it to open the full, pannable view in an overlay.
export default function StreetThumb({ lat, lng, heading, isDC = true, label, className = '' }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const wrapRef = useRef(null);
  const panoRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !apiKey) return;
    let cancelled = false;
    loadMaps(apiKey).then(google => {
      if (cancelled || !panoRef.current) return;
      const pano = new google.maps.StreetViewPanorama(panoRef.current, {
        position: { lat, lng },
        // same starting view the viewr gets
        pov: { heading: heading ?? 210, pitch: 0 },
        zoom: 0,
        disableDefaultUI: true,
        clickToGo: false,
        linksControl: false,
        addressControl: false,
        showRoadLabels: false,
        scrollwheel: false,
        motionTracking: false,
        motionTrackingControl: false,
      });
      const kick = () => google.maps.event.trigger(pano, 'resize');
      setTimeout(kick, 60);
      setTimeout(kick, 400);
    });
    return () => { cancelled = true; };
  }, [visible, apiKey, lat, lng, heading]);

  return (
    <>
      <div ref={wrapRef} className={`street-thumb ${className}`}>
        <div className="street-thumb-pano" ref={panoRef} />
        {!apiKey && <span className="team-hint">no street view key</span>}
        <button
          type="button"
          className="street-thumb-hit"
          aria-label={label ? `Look around ${label}` : 'Look around this spot'}
          onClick={() => setOpen(true)}
        />
      </div>
      {open && createPortal(
        <div className="thumb-modal" onClick={() => setOpen(false)}>
          <div className="thumb-modal-body" onClick={e => e.stopPropagation()}>
            <div className="thumb-modal-bar">
              <span>{label}</span>
              <button className="leave-link" onClick={() => setOpen(false)}>close</button>
            </div>
            <div className="thumb-modal-pano">
              <StreetView isDC={isDC} location={{ lat, lng, heading }} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
