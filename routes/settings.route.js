const express = require('express');
const router = express.Router();
const { getDailyRate, updateDailyRate } = require('../controllers/settings.controller');

// Get current daily rate (public endpoint)
router.get('/daily-rate', getDailyRate);

// Update daily rate (public endpoint)
router.put('/daily-rate', updateDailyRate);

module.exports = router;