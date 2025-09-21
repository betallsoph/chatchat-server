const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Route chính
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  //user join phòng
  socket.on('join_room', (data) => {
    socket.join(data.room);
    socket.broadcast.to(data.room).emit('user_joined', {
      username: data.username,
      message: `${data.username} đã tham gia phòng ${data.room}`
    });
    console.log(`User ${data.username} joined room ${data.room}`);
  });

  //user leave phòng
  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room ${roomId}`);
  });

  // Khi có tin nhắn mới
  socket.on('send_message', (data) => {
    io.to(data.room).emit('receive_message', {
      username: data.username,
      message: data.message,
      room: data.room,
      timestamp: new Date()
    });
  });

  //typing
  socket.on('typing', (data) => {
    socket.broadcast.to(data.room).emit('typing', {
      username: data.username,
      isTyping: data.isTyping,
      message: `${data.username} đang gõ...`
    });
  });

  // Khi user disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});