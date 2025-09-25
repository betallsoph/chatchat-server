const express = require('express');
const { getMessages } = require('../controllers/chatController');
const firebaseAuth = require('../middleware/firebaseAuth');

const router = express.Router();

// Lấy tin nhắn theo room
router.get('/messages/:room', firebaseAuth, getMessages);

module.exports = router;


