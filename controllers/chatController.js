const Message = require('../models/Message');

// GET /api/chat/messages/:room
async function getMessages(req, res) {
  try {
    const { room } = req.params;
    if (!room) {
      return res.status(400).json({ message: 'Thiếu tham số room' });
    }

    const messages = await Message.find({ room })
      .sort({ createdAt: 1 })
      .limit(100);

    return res.json(messages);
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
}

module.exports = {
  getMessages
};


