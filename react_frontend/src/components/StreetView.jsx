import React, { useEffect, useRef } from 'react';

// Load the Maps JS API once and share the promise
let mapsPromise;
function loadMaps(apiKey) {
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

const FIXED_ZOOM = 1;

export default function StreetView({ isDC, location }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const panoRef = useRef(null);
  const panoObj = useRef(null);

  // Fall back to a fun spot if the game has no locations loaded
  const lat = location?.lat ?? (isDC ? 38.9097 : 40.7580);
  const lng = location?.lng ?? (isDC ? -77.0434 : -73.9855);
  const heading = location?.heading ?? 210;

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    loadMaps(apiKey).then(google => {
      if (cancelled || !panoRef.current) return;
      if (panoObj.current) {
        // round advanced, move the existing pano
        panoObj.current.setPosition({ lat, lng });
        panoObj.current.setPov({ heading, pitch: 0 });
        return;
      }
      const pano = new google.maps.StreetViewPanorama(panoRef.current, {
        position: { lat, lng },
        pov: { heading, pitch: 0 },
        zoom: FIXED_ZOOM,
        // pan around all you want, but nothing that gives the location away
        addressControl: false,
        linksControl: false,
        showRoadLabels: false,
        clickToGo: false,
        // and no zooming in on street signs
        zoomControl: false,
        scrollwheel: false,
        disableDoubleClickZoom: true,
        panControl: false,
        fullscreenControl: false,
        motionTracking: false,
        motionTrackingControl: false,
      });
      // pinch zoom has no off switch, so snap it back instead
      pano.addListener('zoom_changed', () => {
        if (pano.getZoom() !== FIXED_ZOOM) pano.setZoom(FIXED_ZOOM);
      });
      panoObj.current = pano;
    });
    return () => { cancelled = true; };
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

  return <div className="streetview-frame" ref={panoRef} />;
}
