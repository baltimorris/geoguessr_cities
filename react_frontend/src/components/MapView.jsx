import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { useState } from 'react';
import 'leaflet/dist/leaflet.css';

export default function MapView() {
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
        center={[38.9072, -77.0369]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ClickHandler />
        {position && <Marker position={position} />}
      </MapContainer>
    </div>
  );
}
