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
  isEdited: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  // NEW: Image upload fields - lưu base64 string trong MongoDB  
  hasImage: {
    type: Boolean,
    default: false
  },
  imageData: {
    type: String,
    default: null // 🔥 Lưu base64 string trực tiếp
  },
  imageFileName: {
    type: String,
    default: null
  },
  imageSize: {
    type: Number,
    default: null
  },
  imageMimeType: {
    type: String,
    default: null
  },
  imageUploadedAt: {
    type: Date,
    default: null
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
