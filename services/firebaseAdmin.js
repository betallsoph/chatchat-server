const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Hỗ trợ nhiều cách cấu hình credential để tránh lỗi PEM:
// 1) FIREBASE_CREDENTIALS_FILE: đường dẫn JSON service account
// 2) FIREBASE_CREDENTIALS_BASE64: nội dung JSON mã hóa base64
// 3) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (với \n được escape)

function buildCredentialFromEnv() {
  const {
    FIREBASE_CREDENTIALS_FILE,
    FIREBASE_CREDENTIALS_BASE64,
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
  } = process.env;

  // Case 1: file JSON
  if (FIREBASE_CREDENTIALS_FILE) {
    const fullPath = path.isAbsolute(FIREBASE_CREDENTIALS_FILE)
      ? FIREBASE_CREDENTIALS_FILE
      : path.join(process.cwd(), FIREBASE_CREDENTIALS_FILE);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`[firebase-admin] Không tìm thấy file: ${fullPath}`);
    }
    const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return admin.credential.cert(content);
  }

  // Case 2: base64 JSON
  if (FIREBASE_CREDENTIALS_BASE64) {
    const json = Buffer.from(FIREBASE_CREDENTIALS_BASE64, 'base64').toString('utf8');
    const content = JSON.parse(json);
    return admin.credential.cert(content);
  }

  // Case 3: 3 biến rời
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    // Xử lý xuống dòng cho private key nếu được lưu dạng một dòng trong env
    let privateKey = FIREBASE_PRIVATE_KEY;
    // Nếu private key bị bọc dấu nháy, loại bỏ đầu/cuối
    if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || (privateKey.startsWith('\'') && privateKey.endsWith('\''))) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');
    return admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey,
    });
  }

  throw new Error('[firebase-admin] Thiếu cấu hình credential. Cần một trong các biến: FIREBASE_CREDENTIALS_FILE | FIREBASE_CREDENTIALS_BASE64 | (FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)');
}

if (!admin.apps.length) {
  try {
    const credential = buildCredentialFromEnv();
    admin.initializeApp({ credential });
  } catch (err) {
    console.error(err);
    console.warn('[firebase-admin] Chưa khởi tạo được Firebase Admin. Các endpoint yêu cầu auth sẽ báo lỗi cho đến khi bạn cấu hình đúng.');
  }
}

module.exports = admin;


