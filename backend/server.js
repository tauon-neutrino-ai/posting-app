const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');

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

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send initial state
  socket.emit('server:state', users);

  // Register or update user
  socket.on('client:register', (data) => {
    const { id, name, color } = data;
    if (!users[id]) {
      users[id] = {
        id,
        name,
        color,
        path: [],
        currentLocation: null,
        isPaused: false,
        lastUpdated: Date.now()
      };
    } else {
      // Just update name and color if they re-register
      users[id].name = name;
      users[id].color = color;
    }
    
    io.emit('server:state', users);
  });

  // Receive location update
  socket.on('client:updateLocation', (data) => {
    const { id, location } = data;
    if (users[id]) {
        // Only add to path and update current location if not paused
        if (!users[id].isPaused) {
            users[id].currentLocation = location;
            // append to path
            users[id].path.push(location);
            users[id].lastUpdated = Date.now();
            io.emit('server:state', users);
        } else {
            // Still update their current location so we know where they stopped, but don't append to path?
            // Actually, if paused, we stop receiving location tracking entirely from client side.
            // But if we do receive it, maybe just ignore or only update currentLocation.
        }
    }
  });

  // Receive pause/resume state
  socket.on('client:setPaused', (data) => {
    const { id, isPaused } = data;
    if (users[id]) {
        users[id].isPaused = isPaused;
        users[id].lastUpdated = Date.now();
        io.emit('server:state', users);
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
  io.emit('server:state', users);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket.io server listening on port ${PORT}`);
});
