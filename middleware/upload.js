const multer = require('multer');

// Store file in memory as Buffer
const storage = multer.memoryStorage();
const upload = multer({ storage });

module.exports = upload;
