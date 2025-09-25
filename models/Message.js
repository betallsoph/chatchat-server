const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true 
  },
  displayName: { 
    type: String 
  },
  text: { 
    type: String, 
    required: true 
  },
  // Legacy fields for backward compatibility
  uid: {
    type: String,
    default: null
  },
  username: {
    type: String,
    required: false
  },
  message: {
    type: String,
    required: false
  },
  room: {
    type: String,
    required: false,
    default: 'general'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Message', messageSchema);
