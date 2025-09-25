const express = require('express');
const firebaseAuth = require('../middleware/firebaseAuth');
const FirebaseUser = require('../models/FirebaseUser');

const router = express.Router();

// GET /api/auth/me - trả về thông tin user từ Firebase token
router.get('/me', firebaseAuth, async (req, res) => {
  try {
    const u = req.firebaseUser;
    // Upsert user profile into MongoDB
    const profile = await FirebaseUser.findOneAndUpdate(
      { uid: u.uid },
      {
        uid: u.uid,
        email: u.email || null,
        displayName: u.name || null,
        photoURL: u.picture || null,
        isOnline: true,
        lastSeen: new Date()
      },
      { new: true, upsert: true }
    );

    return res.json(profile);
  } catch (err) {
    return res.status(500).json({ message: 'Auth error', error: err.message });
  }
});

module.exports = router;
// Đăng xuất: đánh dấu offline
router.post('/logout', firebaseAuth, async (req, res) => {
  try {
    const { uid } = req.firebaseUser;
    await FirebaseUser.findOneAndUpdate({ uid }, { isOnline: false, lastSeen: new Date() });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: 'Logout error', error: err.message });
  }
});


