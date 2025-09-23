const express = require('express');
const { getMessages } = require('../controllers/chatController');

const router = express.Router();

// Lấy tin nhắn theo room
router.get('/messages/:room', getMessages);

module.exports = router;


