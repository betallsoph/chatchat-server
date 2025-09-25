# Backend Final Integration Guide - Chatchat Global Chat

Tài liệu tổng hợp cuối cùng để backend cấu hình hoàn chỉnh cho React client Global Chat.

## 🚨 VẤN ĐỀ HIỆN TẠI
Client đang gặp lỗi CORS và không kết nối được Socket.IO. Console hiển thị:
- `Cross-Origin Request Blocked: CORS header 'Access-Control-Allow-Origin' missing`
- `Failed to connect: TypeError: NetworkError`
- Status code: 204 (không có response body)

## ✅ YÊU CẦU BACKEND HOÀN CHỈNH

### 1) Cấu hình CORS (QUAN TRỌNG NHẤT)
```js
const cors = require('cors');

const allowedOrigins = [
  'http://localhost:5173',           // React dev server
  'https://your-app.vercel.app'      // Production domain
];

// CORS cho REST API
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: true
}));

// BẮT BUỘC: Xử lý preflight OPTIONS
app.options('*', cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
  credentials: true
}));
```

### 2) REST API Endpoints
```js
// GET /messages - Lịch sử tin nhắn (YÊU CẦU TOKEN)
app.get('/messages', authenticateToken, async (req, res) => {
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

// Middleware xác thực Firebase token
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Bearer token' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decoded.uid,
      name: decoded.name,
      email: decoded.email
    };
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

### 3) Socket.IO Configuration
```js
const { Server } = require('socket.io');

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Middleware xác thực Socket.IO
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));
    
    const decoded = await admin.auth().verifyIdToken(token);
    socket.data.user = {
      uid: decoded.uid,
      name: decoded.name,
      email: decoded.email
    };
    next();
  } catch (error) {
    next(new Error('Invalid token'));
  }
});

// Xử lý events
io.on('connection', (socket) => {
  console.log('User connected:', socket.data.user.uid);
  
  socket.on('message:send', async ({ text }) => {
    try {
      const user = socket.data.user;
      
      // Lưu vào MongoDB
      const message = await Message.create({
        userId: user.uid,
        displayName: user.name || user.email,
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
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.data.user.uid);
  });
});
```

### 4) MongoDB Schema
```js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  displayName: { type: String },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);
```

### 5) Firebase Admin SDK Setup
```js
const admin = require('firebase-admin');

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
```

### 6) Environment Variables (.env)
```bash
PORT=3000
MONGO_URI=mongodb://localhost:27017/chatchat
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## 🧪 KIỂM THỬ NHANH

### Test CORS
```bash
# Preflight request
curl -i -X OPTIONS http://localhost:3000/messages \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type"

# Phải thấy headers:
# Access-Control-Allow-Origin: http://localhost:5173
# Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
# Access-Control-Allow-Headers: Authorization,Content-Type
```

### Test REST API
```bash
# Test với token (thay YOUR_TOKEN bằng token thật)
curl -i http://localhost:3000/messages \
  -H "Origin: http://localhost:5173" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test Socket.IO
```js
// Trong browser console
const socket = io('http://localhost:3000', { 
  auth: { token: 'YOUR_FIREBASE_TOKEN' },
  transports: ['websocket']
});
socket.on('connect', () => console.log('Connected!'));
```

## 🐛 DEBUGGING CHECKLIST

- [ ] Server chạy trên port 3000
- [ ] CORS middleware được đặt TRƯỚC tất cả routes
- [ ] OPTIONS handler trả về đúng headers
- [ ] Firebase Admin SDK đã khởi tạo
- [ ] MongoDB đã kết nối
- [ ] Socket.IO đã khởi tạo với CORS
- [ ] Route `/messages` trả về JSON, không phải 204
- [ ] Token verification hoạt động đúng

## 📋 CLIENT EXPECTATIONS

Client sẽ gọi:
- `GET /messages` với header `Authorization: Bearer <token>`
- Socket.IO với `auth: { token }` và emit `message:send`
- Mong đợi nhận `message:new` event

Response format:
```json
{
  "_id": "string",
  "userId": "firebase_uid", 
  "displayName": "User Name",
  "text": "Message content",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

## 🚀 DEPLOYMENT NOTES

- Production: thay `http://localhost:5173` bằng domain Vercel thật
- Nginx: thêm `proxy_set_header Authorization $http_authorization;`
- Vercel: đảm bảo serverless functions hỗ trợ WebSocket

---

**Sau khi cấu hình xong, restart server và test với client. Nếu vẫn lỗi, gửi log server và response headers để debug tiếp.**
