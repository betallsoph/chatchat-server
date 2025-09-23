const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const app = express();
const mongoose = require('mongoose');
require('dotenv').config();
const Message = require('./models/Message');

const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Route chính
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// REST routes
app.use('/api/chat', require('./routes/chat'));

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  //user join phòng
  socket.on('join_room', async (data) => {
    socket.join(data.room);
    socket.broadcast.to(data.room).emit('user_joined', {
      username: data.username,
      message: `${data.username} đã tham gia phòng ${data.room}`
    });
    console.log(`User ${data.username} joined room ${data.room}`);
    
    // Load tin nhắn cũ khi join phòng
    try {
      const messages = await Message.find({ room: data.room })
        .sort({ createdAt: 1 })
        .limit(50); // Chỉ load 50 tin nhắn gần nhất
      
      socket.emit('load_messages', messages);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  });

  //user leave phòng
  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room ${roomId}`);
  });

  // Khi có tin nhắn mới
  socket.on('send_message', async (data) => {
    try {
      // Lưu tin nhắn vào database
      const newMessage = new Message({
        username: data.username,
        message: data.message,
        room: data.room
      });
      
      await newMessage.save();
      
      // Gửi tin nhắn tới tất cả user trong phòng
      io.to(data.room).emit('receive_message', {
        username: data.username,
        message: data.message,
        room: data.room,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  //typing
  socket.on('typing', (data) => {
    socket.broadcast.to(data.room).emit('user_typing', {
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

//connect to mongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.log(err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});