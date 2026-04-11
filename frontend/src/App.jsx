import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { io } from 'socket.io-client';
import MapArea from './components/MapArea';

// Connect to backend (assuming it runs on port 3001 locally, or empty if served together)
// For dev, we point to localhost:3001
const socket = io(import.meta.env.PROD ? undefined : 'http://localhost:3001');

// Generate random bright colors for users
const generateRandomColor = () => {
  const hues = [0, 30, 60, 120, 200, 240, 280, 320];
  const hue = hues[Math.floor(Math.random() * hues.length)];
  return `hsl(${hue}, 80%, 50%)`;
};

function App() {
  const [user, setUser] = useState(null);
  const [usersState, setUsersState] = useState({});

  useEffect(() => {
    // Check if user already exists in local storage
    const storedUserId = localStorage.getItem('posting-app-userid');
    const storedUserName = localStorage.getItem('posting-app-username');
    const storedUserColor = localStorage.getItem('posting-app-color');

    // Default to existing info if available, but don't auto-register 
    // until they actually see the screen. If they just open it, the screen shows prepopulated.
    
    // Listen for state updates from server
    socket.on('server:state', (state) => {
      setUsersState(state);
    });

    return () => {
      socket.off('server:state');
    };
  }, []);

  const handleRegister = (name) => {
    let id = localStorage.getItem('posting-app-userid');
    if (!id) {
      id = uuidv4();
      localStorage.setItem('posting-app-userid', id);
    }
    
    let color = localStorage.getItem('posting-app-color');
    if (!color) {
      color = generateRandomColor();
      localStorage.setItem('posting-app-color', color);
    }
    
    localStorage.setItem('posting-app-username', name);

    const newUserInfo = { id, name, color };
    setUser(newUserInfo);
    
    // Tell server about us
    socket.emit('client:register', newUserInfo);
  };

  if (!user) {
    return <RegistrationScreen onRegister={handleRegister} />;
  }

  return (
    <div className="app-container">
      <MapArea user={user} usersState={usersState} socket={socket} />
    </div>
  );
}

function RegistrationScreen({ onRegister }) {
  const [name, setName] = useState(localStorage.getItem('posting-app-username') || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onRegister(name.trim());
    }
  };

  return (
    <div className="registration-container">
      <div className="registration-card">
        <h1>Welcome</h1>
        <p>ポスティング大会 アプリ</p>
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="name">お名前を入力してください</label>
            <input
              id="name"
              type="text"
              placeholder="例: 山田太郎"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              autoFocus
            />
          </div>
          <button type="submit" className="btn-primary">
            はじめる
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
