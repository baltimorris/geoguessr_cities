// MapView.jsx - the guessr's guess map: tap anywhere to drop a pin. Centered on
// DC or NYC; pure Leaflet map, no game logic.

import { MapContainer, Marker, useMapEvents } from 'react-leaflet';
import { useState } from 'react';
import 'leaflet/dist/leaflet.css';
import ThemedTiles from './ThemedTiles';

export default function MapView({ isDC = true, onPick, position }) {
  const [internal, setInternal] = useState(null);
  // controlled when a position prop is passed, self-managed otherwise
  const shown = position !== undefined ? position : internal;

  function ClickHandler() {
    useMapEvents({
      click(e) {
        // dragging the map around the world can make lng run past +-180;
        // wrap() folds it back into the real range the db accepts
        const picked = e.latlng.wrap();
        setInternal(picked);
        if (onPick) onPick(picked);
      },
    });
    return null;
  }

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer
        key={isDC ? 'DC' : 'NYC'}
        center={isDC ? [38.9072, -77.0369] : [40.7128, -74.0060]}
        zoom={isDC ? 13 : 12}
        zoomSnap={0}
        style={{ height: '100%', width: '100%' }}
      >
        <ThemedTiles />
        <ClickHandler />
        {shown && <Marker position={shown} />}
      </MapContainer>
    </div>
  );
}
