import React from 'react';
import './App.css'; // Make sure your styles are imported
import MapView from './MapView';

function App() {
  return (
    <div className="app-container">
      <header className="header">
        <div className="bars-container">
          <div className="RD"></div>
          <div className="OR"></div>
          <div className="YL"></div>
          <div className="GR"></div>
          <div className="BL"></div>
          <div className="SV"></div>
        </div>
        <div className="header-text-container">
          {/* DC text */}
          <div className="dc-float">
            DC
          </div>
          {/* Main header text */}
          <div className="header-text">
            LocalGuessr
          </div>
        </div>
      </header>

      {/* Your map and other content here */}
      <main>
        <div className="map-container">
          <MapView />
        </div>
      </main>
    </div>
  );
}

export default App;
