import React, { useEffect, useRef, useState } from 'react';

// Load the Maps JS API once and share the promise
let mapsPromise;
export function loadMaps(apiKey) {
  if (!mapsPromise) {
    mapsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly`;
      script.async = true;
      script.onload = () => resolve(window.google);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  return mapsPromise;
}

// three discrete zoom steps: buttons move between them, pinch/scroll can't.
// index 0 is the default, furthest-out view.
const ZOOM_STEPS = [0, 1, 2];
const START_STEP = 0;

export default function StreetView({ isDC, location }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const panoRef = useRef(null);
  const panoObj = useRef(null);
  const observer = useRef(null);
  const stepRef = useRef(START_STEP);
  const [step, setStep] = useState(START_STEP);

  // Fall back to a fun spot if the game has no locations loaded
  const lat = location?.lat ?? (isDC ? 38.9097 : 40.7580);
  const lng = location?.lng ?? (isDC ? -77.0434 : -73.9855);
  const heading = location?.heading ?? 210;

  const applyStep = (next) => {
    const clamped = Math.max(0, Math.min(ZOOM_STEPS.length - 1, next));
    stepRef.current = clamped;
    setStep(clamped);
    panoObj.current?.setZoom(ZOOM_STEPS[clamped]);
  };

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    loadMaps(apiKey).then(google => {
      if (cancelled || !panoRef.current) return;
      if (panoObj.current) {
        panoObj.current.setPosition({ lat, lng });
        panoObj.current.setPov({ heading, pitch: 0 });
        return;
      }
      const pano = new google.maps.StreetViewPanorama(panoRef.current, {
        position: { lat, lng },
        pov: { heading, pitch: 0 },
        zoom: ZOOM_STEPS[stepRef.current],
        // pan around all you want, but nothing that gives the location away
        addressControl: false,
        linksControl: false,
        showRoadLabels: false,
        clickToGo: false,
        // zoom only via our own buttons, not pinch/scroll/double-click
        zoomControl: false,
        scrollwheel: false,
        disableDoubleClickZoom: true,
        panControl: false,
        fullscreenControl: false,
        motionTracking: false,
        motionTrackingControl: false,
      });
      // snap any stray zoom (pinch) back to the current step
      pano.addListener('zoom_changed', () => {
        const want = ZOOM_STEPS[stepRef.current];
        if (pano.getZoom() !== want) pano.setZoom(want);
      });
      panoObj.current = pano;

      // a pano that gets its size after being built can render solid black
      const kick = () => google.maps.event.trigger(pano, 'resize');
      setTimeout(kick, 60);
      setTimeout(kick, 400);
      const ro = new ResizeObserver(kick);
      ro.observe(panoRef.current);
      observer.current = ro;
    });
    return () => {
      cancelled = true;
      observer.current?.disconnect();
      observer.current = null;
    };
  }, [apiKey, lat, lng, heading]);

  if (!apiKey) {
    return (
      <div className="streetview-fallback">
        <p>Street view needs a Google Maps key.</p>
        <p className="team-hint">
          Put VITE_GOOGLE_MAPS_API_KEY=yourkey in react_frontend/.env.local and restart the dev server
        </p>
      </div>
    );
  }

  return (
    <div className="streetview-frame">
      <div className="pano-canvas" ref={panoRef} />
      <div className="sv-zoom">
        <button aria-label="Zoom in" disabled={step >= ZOOM_STEPS.length - 1} onClick={() => applyStep(step + 1)}>+</button>
        <div className="sv-zoom-dots" aria-label={`Zoom level ${step + 1} of ${ZOOM_STEPS.length}`}>
          {/* top dot = most zoomed in (next to +), bottom dot = furthest out (next to -) */}
          {ZOOM_STEPS.map((_, i) => ZOOM_STEPS.length - 1 - i).map(i => (
            <span key={i} className={`sv-zoom-dot ${i === step ? 'active' : ''}`} />
          ))}
        </div>
        <button aria-label="Zoom out" disabled={step <= 0} onClick={() => applyStep(step - 1)}>&minus;</button>
      </div>
    </div>
  );
}
