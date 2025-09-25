const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const app = express();
const mongoose = require('mongoose');
require('dotenv').config();
const Message = require('./models/Message');

const server = http.createServer(app);

// CORS configuration - whitelist specific origins
const allowedOrigins = [
  'http://localhost:5173',           // React dev server
  'https://your-app.vercel.app'      // Production domain (update as needed)
];

// Allow environment override
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
if (CLIENT_ORIGINS.length) {
  allowedOrigins.push(...CLIENT_ORIGINS);
}

const io = socketIo(server, {
    cors: {
        origin: allowedOrigins,
        credentials: true,
        methods: ['GET', 'POST']
    }
});

// Firebase auth for Socket.IO
const admin = require('./services/firebaseAdmin');
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('Missing Firebase token'));
    if (!admin.apps.length) return next(new Error('Firebase Admin chưa cấu hình'));
    const decoded = await admin.auth().verifyIdToken(token);
    socket.data.user = decoded; // attach uid/email
    return next();
  } catch (err) {
    return next(new Error('Invalid Firebase token'));
  }
});

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Authorization','Content-Type'],
  credentials: true
}));

// BẮT BUỘC: Xử lý preflight OPTIONS
app.options(/.*/, cors({
  origin: allowedOrigins,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Authorization','Content-Type'],
  credentials: true
}));
app.use(express.json());

// Route chính (không dùng static HTML)
app.get('/', (req, res) => {
  res.json({ name: 'chatchat_server', status: 'ok' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// REST routes
app.use('/api/chat', require('./routes/chat'));
app.use('/api/auth', require('./routes/auth'));

// GET /messages - Lịch sử tin nhắn (YÊU CẦU TOKEN)
const firebaseAuth = require('./middleware/firebaseAuth');
app.get('/messages', firebaseAuth, async (_req, res) => {
  try {
    const messages = await Message.find()
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();
    
    res.json(messages.map(msg => ({
      _id: msg._id.toString(),
      userId: msg.userId,
      displayName: msg.displayName,
      text: msg.text,
      createdAt: msg.createdAt.toISOString()
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Global chat only

  // message:send -> message:new (global chat)
  socket.on('message:send', async ({ text }) => {
    try {
      const user = socket.data && socket.data.user ? socket.data.user : null;
      if (!user || typeof text !== 'string' || !text.trim()) return;
      
      // Lưu vào MongoDB với schema mới
      const message = await Message.create({
        userId: user.uid,
        displayName: user.name || user.email || 'User',
        text: text.trim(),
        createdAt: new Date()
      });
      
      // Gửi cho tất cả clients
      io.emit('message:new', {
        _id: message._id.toString(),
        userId: message.userId,
        displayName: message.displayName,
        text: message.text,
        createdAt: message.createdAt.toISOString()
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  // Remove room-based handlers (global chat only)

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