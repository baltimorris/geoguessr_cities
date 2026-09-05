import { TileLayer } from 'react-leaflet';
import { useEffect, useState } from 'react';

// CartoDB's free anonymous basemaps now watermark every tile with
// "API key required" (they locked that down since this was first wired up),
// so this uses Esri's World Gray Canvas instead - same clean minimal look,
// still free with no key/signup, and it ships a light + dark variant.
const LIGHT = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const DARK = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const ATTRIB = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ';

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
      maxZoom={20}
      maxNativeZoom={16} // Esri only renders this layer up to z16; past that, upscale rather than 404
    />
  );
}
