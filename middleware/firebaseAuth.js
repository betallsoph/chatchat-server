const admin = require('../services/firebaseAdmin');

async function firebaseAuth(req, res, next) {
  // Allow CORS preflight to pass through without auth
  if (req.method === 'OPTIONS') return next();
  try {
    const authHeader = req.header('Authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!idToken) return res.status(401).json({ message: 'Missing Bearer token' });

    if (!admin.apps.length) {
      return res.status(500).json({ message: 'Firebase Admin chưa được cấu hình' });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    req.firebaseUser = decoded; // uid, email, name, picture
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token', error: err.message });
  }
}

module.exports = firebaseAuth;


