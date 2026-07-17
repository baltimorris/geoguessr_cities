import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { useState } from 'react';
import 'leaflet/dist/leaflet.css';

export default function MapView({ isDC = true }) {
  const [position, setPosition] = useState(null);

  function ClickHandler() {
    useMapEvents({
      click(e) {
        setPosition(e.latlng);
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
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickHandler />
        {position && <Marker position={position} />}
      </MapContainer>
    </div>
  );
}
