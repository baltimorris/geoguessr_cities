import { TileLayer } from 'react-leaflet';
import { useEffect, useState } from 'react';

// CartoDB basemaps, the same clean look the R app used (CartoDB.Positron),
// with a dark variant so the map matches the app's light/dark theme.
const LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIB = '&copy; OpenStreetMap &copy; CARTO';

export default function ThemedTiles() {
  const [dark, setDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = e => setDark(e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

  return (
    <TileLayer
      key={dark ? 'dark' : 'light'}
      url={dark ? DARK : LIGHT}
      attribution={ATTRIB}
      subdomains="abcd"
      maxZoom={20}
    />
  );
}
