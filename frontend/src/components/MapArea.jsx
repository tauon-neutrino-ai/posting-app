import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';
import { Play, Pause, Navigation } from 'lucide-react';

const HON_ATSUGI_COORDS = [35.4394, 139.3639];

const createCustomIcon = (name, color) => {
  return L.divIcon({
    className: 'custom-icon-wrapper',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; pointer-events: none; transform: translateY(-5px);">
        <div class="custom-marker-label" style="border-color: ${color}; color: ${color};">${name}</div>
        <div style="width: 16px; height: 16px; background: ${color}; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 6px rgba(0,0,0,0.4); margin-top: 6px;"></div>
      </div>
    `,
    iconSize: [120, 60],
    iconAnchor: [60, 60] // Point anchor to the bottom circle
  });
};

function MapArea({ user, usersState, socket }) {
  const [isPaused, setIsPaused] = useState(false);
  const watchIdRef = useRef(null);

  useEffect(() => {
    // Start watching position
    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const location = [latitude, longitude];
          
          if (!isPaused) {
            socket.emit('client:updateLocation', { id: user.id, location });
          }
        },
        (error) => {
          console.error("Error watching position", error);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
    } else {
      console.warn("Geolocation not supported");
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isPaused, socket, user.id]);

  const togglePause = () => {
    const newPausedState = !isPaused;
    setIsPaused(newPausedState);
    socket.emit('client:setPaused', { id: user.id, isPaused: newPausedState });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Header Info Panel */}
      <div className="map-header">
        <div className="glass-panel user-info">
          <div className="color-dot" style={{ backgroundColor: user.color }}></div>
          <span className="user-name">{user.name}</span>
        </div>
        
        <div className="glass-panel" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          参加者: {Object.keys(usersState).length}人
        </div>
      </div>

      <MapContainer 
        center={HON_ATSUGI_COORDS} 
        zoom={15} 
        style={{ width: '100%', height: '100%', zIndex: 1 }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" 
          // Using Carto Voyager tiles for a clean, light-mode modern look that makes colored paths pop out
        />
        
        {/* Draw paths and markers for all active users */}
        {Object.values(usersState).map((u) => {
          return (
            <React.Fragment key={u.id}>
              {/* Movement Path */}
              {u.path && u.path.length > 0 && (
                <Polyline 
                  positions={u.path} 
                  pathOptions={{ 
                    color: u.color, 
                    weight: 5, 
                    opacity: 0.8,
                    lineCap: 'round',
                    lineJoin: 'round',
                    dashArray: u.isPaused ? '5, 10' : null // Dotted line if paused
                  }} 
                />
              )}
              
              {/* Current Location Marker */}
              {u.currentLocation && (
                <Marker 
                  position={u.currentLocation} 
                  icon={createCustomIcon(u.name, u.color)}
                  opacity={u.isPaused ? 0.6 : 1}
                />
              )}
            </React.Fragment>
          );
        })}
      </MapContainer>

      {/* Floating Action Buttons */}
      <div className="action-controls">
        <button 
          className={`btn-pause ${isPaused ? 'is-paused' : ''}`} 
          onClick={togglePause}
        >
          {isPaused ? (
            <>
              <Play size={20} />
              再開する
            </>
          ) : (
            <>
              <Pause size={20} />
              一時停止
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default MapArea;
