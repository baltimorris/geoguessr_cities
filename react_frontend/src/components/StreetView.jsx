import React from 'react';

export default function StreetView({ isDC }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  // Placeholder spots until rounds come from the backend: Dupont Circle / Times Square
  const location = isDC ? '38.9097,-77.0434' : '40.7580,-73.9855';

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
    <iframe
      className="streetview-frame"
      title="street view"
      src={`https://www.google.com/maps/embed/v1/streetview?key=${apiKey}&location=${location}&heading=210&pitch=0&fov=90`}
      allowFullScreen
    />
  );
}
