'use client';

import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { useState } from 'react';
import 'leaflet/dist/leaflet.css';

// Separate component for map click handling
function ClickHandler({ setPosition }: { setPosition: (pos: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });
  return null;
}

export default function WebMap() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <div style={{ height: '100vh' }}>
      <MapContainer center={[38.9072, -77.0369]} zoom={13} style={{ height: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickHandler setPosition={setPosition} />
        {position && <Marker position={position} />}
      </MapContainer>
      {position && (
        <div style={{ position: 'absolute', bottom: 40, left: 20, background: 'white', padding: 10 }}>
          Lat: {position.lat.toFixed(5)}, Lng: {position.lng.toFixed(5)}
        </div>
      )}
    </div>
  );
}
