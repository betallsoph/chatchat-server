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

// DEBUG endpoint theo frontend request để test image upload 
app.get('/debug/images', async (req, res) => {
  try {
    const messagesWithImages = await Message.find({ hasImage: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    const debugInfo = messagesWithImages.map(msg => ({
      _id: msg._id.toString(),
      fileName: msg.imageFileName,
      imageSize: msg.imageSize,
      mimeType: msg.imageMimeType,
      hasImageData: !!msg.imageData,
      imageDataLength: msg.imageData?.length || 0,
      imageDataPreview: msg.imageData?.substring(0, 50) + '...',
      isValidBase64: msg.imageData?.startsWith('data:image/') || false,
      createdAt: msg.createdAt
    }));
    
    res.json({ 
      count: messagesWithImages.length,
      messages: debugInfo 
    });
  } catch (error) {
    res.status(500).json({ error: 'Debug failed', message: error.message });
  }
});

// GET /messages - Lịch sử tin nhắn (YÊU CẦU TOKEN) với base64 images
const firebaseAuth = require('./middleware/firebaseAuth');
app.get('/messages', firebaseAuth, async (_req, res) => {
  try {
    const messages = await Message.find({ isDeleted: false })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();
    
    // Transform messages để include imageData for base64 approach
    const messagesWithImages = messages.map(msg => {
      const messageObj = {
        _id: msg._id.toString(),
        userId: msg.userId,
        displayName: msg.displayName,
        text: msg.text,
        hasImage: !!msg.hasImage,
        imageFileName: msg.imageFileName || null,
        imageSize: msg.imageSize || null,
        imageMimeType: msg.imageMimeType || null,
        imageData: null, // 🔥 Chỉ include if có image
        imageUploadedAt: msg.imageUploadedAt ? msg.imageUploadedAt.toISOString() : null,
        createdAt: msg.createdAt.toISOString(),
        isEdited: msg.isEdited || false,
        isDeleted: false // Không trả về tin nhắn đã xóa
      };
      
      // Ensure imageData is set from base64 data for frontend compatibility
      if (msg.hasImage && msg.imageData) {
        messageObj.imageData = msg.imageData; // 🔥 Include base64 data
        messageObj.imageUrl = msg.imageData; // Frontend có thể dùng imageData hoặc imageUrl
      }
      
      return messageObj;
    });
    
    res.json(messagesWithImages);
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// PUT /messages/:id - Sửa tin nhắn
app.put('/messages/:id', firebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.firebaseUser.uid;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const message = await Message.findOneAndUpdate(
      { _id: id, userId, isDeleted: false },
      { 
        text: text.trim(),
        isEdited: true,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ error: 'Message not found or you cannot edit this message' });
    }

    // Broadcast to all clients
    io.emit('message:edited', {
      _id: message._id.toString(),
      userId: message.userId,
      displayName: message.displayName,
      text: message.text,
      isEdited: message.isEdited,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString()
    });

    res.json({
      _id: message._id.toString(),
      userId: message.userId,
      displayName: message.displayName,
      text: message.text,
      isEdited: message.isEdited,
      createdAt: message.createdAt.toISOString(),
      updatedAt: message.updatedAt.toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// DELETE /messages/:id - Xóa tin nhắn  
app.delete('/messages/:id', firebaseAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.firebaseUser.uid;

    const message = await Message.findOneAndUpdate(
      { _id: id, userId, isDeleted: false },
      { 
        isDeleted: true,
        deletedAt: new Date()
      },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ error: 'Message not found or you cannot delete this message' });
    }

    // Broadcast to all clients
    io.emit('message:deleted', {
      _id: message._id.toString(),
      userId: message.userId,
      deletedAt: message.deletedAt.toISOString()
    });

    res.json({ success: true, deletedAt: message.deletedAt.toISOString() });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Global chat only

  // message:send -> message:new (global chat) - với support cho images
  socket.on('message:send', async (data) => {
    try {
      const { text, image, imageFileName, imageSize } = data;
      const user = socket.data && socket.data.user ? socket.data.user : null;
      
      if (!user) return;
      
      if (image) {
        console.log('Processing image upload:', { imageLength: image?.length, imageFileName, imageSize });
        
        // Handle image message
        // Parse base64 để get MIME type
        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          console.error('Invalid base64 format, received:', image?.substring(0, 100));
          socket.emit('error', { message: 'Invalid image data format' });
          return;
        }
        
        const mimeType = matches[1];
        const base64Data = matches[2];
        console.log('Parsed image data:', { mimeType, base64Length: base64Data.length });
        
        // Validate file size (5MB limit)
        if (imageSize && imageSize > 5 * 1024 * 1024) {
          socket.emit('error', { message: 'Image too large (max 5MB)' });
          return;
        }
        
        // Validate MIME type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(mimeType)) {
          console.error('Invalid MIME type:', mimeType);
          socket.emit('error', { message: 'Invalid image type' });
          return;
        }
        
        // DIRECT SAVE BASE64 VÀO MONGODB - Lưu base64 string trực tiếp
        const message = await Message.create({
          userId: user.uid,
          displayName: user.name || user.email || 'User',
          text: text && text.trim() ? text.trim() : '📷 Image',
          hasImage: true,
          imageData: image, // 🔥 Lưu base64 string trực tiếp  
          imageFileName: imageFileName || `image.${mimeType.split('/')[1]}`,
          imageSize: imageSize || Buffer.from(base64Data, 'base64').length,
          imageMimeType: mimeType,
          imageUploadedAt: new Date(),
          createdAt: new Date()
        });
        
        // Broadcast to all clients với imageData
        const imagePayload = {
          _id: message._id.toString(),
          userId: message.userId,
          displayName: message.displayName,
          text: message.text,
          hasImage: true,
          imageData: message.imageData, // 🔥 Trả về base64 data
          imageFileName: message.imageFileName,
          imageSize: message.imageSize,
          imageMimeType: message.imageMimeType,
          imageUploadedAt: message.imageUploadedAt.toISOString(),
          createdAt: message.createdAt.toISOString(),
          isEdited: false,
          isDeleted: false
        };
        
        // Enhanced debugging theo frontend request  
        const isValidBase64 = imagePayload.imageData && imagePayload.imageData.startsWith('data:image/');
        
        if (!isValidBase64) {
          console.error('❌ FRONTEND ERROR: Invalid imageData format not starting with data:image/');
          console.error('Data preview:', imagePayload.imageData?.substring(0, 100));
        }
        
        console.log('✅ FRONTEND: Broadcasting image message:', { 
          id: imagePayload._id, 
          hasImage: imagePayload.hasImage,
          imageDataLength: imagePayload.imageData?.length,
          imageFileName: imagePayload.imageFileName,
          imageDataPreview: imagePayload.imageData?.substring(0, 50) + '...',
          isValidBase64: isValidBase64
        });
        
        io.emit('message:new', imagePayload);
        
      } else {
        // Handle text-only message  
        if (typeof text !== 'string' || !text.trim()) return;
        
        const message = await Message.create({
          userId: user.uid,
          displayName: user.name || user.email || 'User',
          text: text.trim(),
          hasImage: false,
          createdAt: new Date()
        });
        
        // Broadcast to all clients
        io.emit('message:new', {
          _id: message._id.toString(),
          userId: message.userId,
          displayName: message.displayName,
          text: message.text,
          hasImage: false,
          createdAt: message.createdAt.toISOString(),
          isEdited: false,
          isDeleted: false
        });
      }
      
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Socket.IO Events cho EDIT/DELETE
  // Edit message via Socket.IO
  socket.on('message:edit', async ({ messageId, text }) => {
    try {
      const user = socket.data && socket.data.user ? socket.data.user : null;
      if (!user || !messageId || !text || !text.trim()) return;

      const message = await Message.findOneAndUpdate(
        { _id: messageId, userId: user.uid, isDeleted: false },
        { 
          text: text.trim(),
          isEdited: true,
          updatedAt: new Date()
        },
        { new: true }
      );

      if (!message) return; // Không có quyền edit hoặc không tìm thấy

      // Broadcast to all clients
      io.emit('message:edited', {
        _id: message._id.toString(),
        userId: message.userId,
        displayName: message.displayName,
        text: message.text,
        isEdited: message.isEdited,
        createdAt: message.createdAt.toISOString(),
        updatedAt: message.updatedAt?.toISOString()
      });
    } catch (error) {
      console.error('Error editing message:', error);
    }
  });

  // Delete message via Socket.IO
  socket.on('message:delete', async ({ messageId }) => {
    try {
      const user = socket.data && socket.data.user ? socket.data.user : null;
      if (!user || !messageId) return;

      const message = await Message.findOneAndUpdate(
        { _id: messageId, userId: user.uid, isDeleted: false },
        { 
          isDeleted: true,
          deletedAt: new Date()
        },
        { new: true }
      );

      if (!message) return; // Không có quyền delete hoặc không tìm thấy

      // Broadcast to all clients
      io.emit('message:deleted', {
        _id: message._id.toString(),
        userId: message.userId,
        deletedAt: message.deletedAt.toISOString()
      });
    } catch (error) {
      console.error('Error deleting message:', error);
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