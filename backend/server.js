const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const admin = require('firebase-admin');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for development
    methods: ["GET", "POST"]
  }
});

// In-memory state
// format: { [userId]: { id, name, color, path: [[lat, lng], ...], currentLocation: [lat, lng], isPaused: false, lastUpdated: Date.now() } }
let users = {};

let db = null;
if (process.env.FIREBASE_CREDENTIALS && process.env.FIREBASE_DB_URL) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DB_URL
    });
    db = admin.database();
    console.log('Firebase Admin initialized successfully.');
    
    // Load state on startup
    db.ref('users').once('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        users = data;
        console.log('State restored from Firebase');
      }
    });
  } catch (err) {
    console.error('Error initializing Firebase:', err);
  }
} else {
  console.log('Warning: FIREBASE_CREDENTIALS or FIREBASE_DB_URL missing. Running in memory mode only.');
}

let hasChanges = false;
function markChanges() {
  hasChanges = true;
}

// Back up to Firebase every 30 seconds
setInterval(() => {
  if (hasChanges && db) {
    db.ref('users').set(users, (error) => {
      if (error) {
        console.error('Firebase save failed:', error);
      } else {
        hasChanges = false;
        console.log('State synced to Firebase');
      }
    });
  }
}, 30000);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send initial state
  socket.emit('server:state', users);

  // Register or update user
  socket.on('client:register', (data) => {
    const { id, name, color, path, currentLocation, isPaused } = data;
    if (!users[id]) {
      users[id] = {
        id,
        name,
        color,
        path: path || [],
        currentLocation: currentLocation || null,
        isPaused: isPaused || false,
        lastUpdated: Date.now()
      };
    } else {
      // Rehydrate path/location if provided (happens on reconnect)
      users[id].name = name;
      users[id].color = color;
      if (path && path.length > 0) users[id].path = path;
      if (currentLocation) users[id].currentLocation = currentLocation;
      if (isPaused !== undefined) users[id].isPaused = isPaused;
      users[id].lastUpdated = Date.now();
    }
    
    markChanges();
    io.emit('server:state', users);
  });

  // Receive location update
  socket.on('client:updateLocation', (data) => {
    const { id, location } = data;
    if (users[id]) {
        if (!users[id].isPaused) {
            users[id].currentLocation = location;
            users[id].path.push(location);
            users[id].lastUpdated = Date.now();
            markChanges();
            // Emit DELTA instead of full state to save massive bandwidth
            io.emit('server:updateLocation', { id, location });
        }
    }
  });

  // Receive pause/resume state
  socket.on('client:setPaused', (data) => {
    const { id, isPaused } = data;
    if (users[id]) {
        users[id].isPaused = isPaused;
        users[id].lastUpdated = Date.now();
        markChanges();
        // Emit DELTA instead of full state
        io.emit('server:setPaused', { id, isPaused });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Serve React App
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Run everyday at 01:00 AM
cron.schedule('0 1 * * *', () => {
  console.log('Running AM 1:00 cron job - resetting state...');
  users = {};
  if (db) {
    db.ref('users').set({}, (error) => {
      if (error) console.error('Firebase clear failed:', error);
      else console.log('Firebase cleared successfully.');
    });
  }
  hasChanges = false;
  io.emit('server:state', users);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket.io server listening on port ${PORT}`);
});
