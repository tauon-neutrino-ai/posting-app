import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker } from 'react-leaflet';
import L from 'leaflet';
import { Play, Pause, Navigation, Sun } from 'lucide-react';

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
  const [isWakeLockEnabled, setIsWakeLockEnabled] = useState(true);
  const [initialCenter, setInitialCenter] = useState(null);
  
  const watchIdRef = useRef(null);
  const lastLocRef = useRef(null);
  const wakeLockRef = useRef(null);

  // Handle Wake Lock
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isWakeLockEnabled) {
        try {
          if (wakeLockRef.current) return;
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch (err) {
          console.error("Wake Lock error:", err);
        }
      } else if (wakeLockRef.current) {
        wakeLockRef.current.release().then(() => {
          wakeLockRef.current = null;
        });
      }
    };
    
    requestWakeLock();
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isWakeLockEnabled) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
         wakeLockRef.current.release().catch(() => {});
         wakeLockRef.current = null;
      }
    };
  }, [isWakeLockEnabled]);

  useEffect(() => {
    // Start watching position
    if ('geolocation' in navigator) {
      // Get initial location for centering
      navigator.geolocation.getCurrentPosition(
        (position) => {
           setInitialCenter([position.coords.latitude, position.coords.longitude]);
        },
        (err) => {
           console.warn("Could not get initial location, defaulting to Hon-Atsugi");
           setInitialCenter([35.4394, 139.3639]);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const location = [latitude, longitude];
          
          if (!isPaused) {
            // 10-meter distance filtering
            let shouldSend = true;
            if (lastLocRef.current) {
               const dist = L.latLng(lastLocRef.current).distanceTo(L.latLng(location));
               if (dist < 10) {
                  shouldSend = false;
               }
            }
            
            if (shouldSend) {
               socket.emit('client:updateLocation', { id: user.id, location });
               lastLocRef.current = location;
            }
          }
        },
        (error) => {
          console.error("Error watching position", error);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
    } else {
      console.warn("Geolocation not supported");
      setInitialCenter([35.4394, 139.3639]);
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

  if (!initialCenter) {
     return (
       <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
         <div className="glass-panel">現在地を取得しています...</div>
       </div>
     );
  }

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
        center={initialCenter} 
        zoom={15} 
        style={{ width: '100%', height: '100%', zIndex: 1 }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" 
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
      <div className="action-controls" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button 
          className={`btn-pause ${!isWakeLockEnabled ? 'is-paused' : ''}`} 
          onClick={() => setIsWakeLockEnabled(!isWakeLockEnabled)}
          style={{ padding: '12px 20px', fontSize: '0.9rem' }}
        >
          <Sun size={20} />
          {isWakeLockEnabled ? 'スリープ防止 動作中' : 'スリープ防止 停止中'}
        </button>

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
