import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map(); // roomCode -> { state, players }

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create_room', (callback) => {
    let code = generateRoomCode();
    while (rooms.has(code)) code = generateRoomCode();
    
    rooms.set(code, { state: null, players: [] });
    socket.join(code);
    callback({ roomCode: code });
    console.log(`Room created: ${code}`);
  });

  socket.on('join_room', (code, callback) => {
    const uppercaseCode = code.toUpperCase();
    if (rooms.has(uppercaseCode)) {
      socket.join(uppercaseCode);
      const roomData = rooms.get(uppercaseCode);
      callback({ success: true, state: roomData.state });
      console.log(`${socket.id} joined ${uppercaseCode}`);
    } else {
      callback({ success: false, error: 'Room not found' });
    }
  });

  socket.on('sync_state', ({ roomCode, state }) => {
    if (rooms.has(roomCode)) {
      rooms.get(roomCode).state = state;
      socket.to(roomCode).emit('state_update', state);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`ScamBoard Multiplayer Server running on port ${PORT}`);
});
