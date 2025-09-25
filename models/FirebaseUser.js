const mongoose = require('mongoose');

const firebaseUserSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  email: { type: String, default: null, lowercase: true, index: true },
  displayName: { type: String, default: null },
  photoURL: { type: String, default: null },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('FirebaseUser', firebaseUserSchema);


